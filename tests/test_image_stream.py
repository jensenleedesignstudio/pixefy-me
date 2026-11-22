"""Offline Flask checks: no calls to OpenAI or Hugging Face."""
from io import BytesIO
import json
import os
from types import SimpleNamespace
import unittest
from unittest.mock import patch

with patch.dict(os.environ, {'OPENAI_API_KEY': 'offline-stream-test'}):
    import app as backend


class ImageStreamTests(unittest.TestCase):
    def setUp(self):
        self.client = backend.app.test_client()

    def post(self, **kwargs):
        return self.client.post('/generate-stream', data={
            'sketch': (BytesIO(b'sketch'), 'sketch.png'),
            'instructions': 'Keep the glasses.',
        }, **kwargs)

    def events(self, response):
        return [json.loads(line[6:]) for line in response.get_data(as_text=True).splitlines()
                if line.startswith('data: ')]

    def test_partial_and_final_images_are_forwarded(self):
        with patch.object(backend.client.images, 'edit') as edit:
            edit.return_value.__enter__.return_value = iter([
                SimpleNamespace(type='image_edit.partial_image', b64_json='preview'),
                SimpleNamespace(type='image_edit.completed', b64_json='final'),
            ])
            response = self.post()
            events = self.events(response)
            self.assertEqual([e['type'] for e in events], ['status', 'preview', 'complete'])
            self.assertEqual(events[-1]['image'], 'final')
            self.assertTrue(edit.call_args.kwargs['stream'])
            self.assertEqual(edit.call_args.kwargs['partial_images'], 3)
            self.assertIn('Keep the glasses.', edit.call_args.kwargs['prompt'])
            self.assertIn('no-transform', response.headers['Cache-Control'])
            edit.return_value.__exit__.assert_called_once()

    def test_final_image_without_previews_is_valid(self):
        with patch.object(backend.client.images, 'edit') as edit:
            edit.return_value.__enter__.return_value = iter([
                SimpleNamespace(type='image_edit.completed', b64_json='final'),
            ])
            self.assertEqual(self.events(self.post())[-1]['type'], 'complete')

    def test_missing_or_empty_upload_does_not_call_provider(self):
        with patch.object(backend.client.images, 'edit') as edit:
            self.assertEqual(self.client.post('/generate-stream').status_code, 400)
            response = self.client.post('/generate-stream', data={
                'sketch': (BytesIO(b''), 'sketch.png')})
            self.assertEqual(response.status_code, 400)
            edit.assert_not_called()

    def test_stream_ending_without_final_sends_error(self):
        with patch.object(backend.client.images, 'edit') as edit:
            edit.return_value.__enter__.return_value = iter([])
            self.assertEqual(self.events(self.post())[-1]['type'], 'error')

    def test_provider_error_is_safe_event(self):
        with patch.object(backend.client.images, 'edit',
                          side_effect=backend.OpenAIError('private provider detail')):
            events = self.events(self.post())
            self.assertEqual(events[-1]['type'], 'error')
            self.assertNotIn('private provider detail', events[-1]['message'])

    def test_quota_error_has_readable_message(self):
        error = backend.RateLimitError('quota', response=SimpleNamespace(
            request=object(), status_code=429, headers={}), body=None)
        with patch.object(backend.client.images, 'edit', side_effect=error):
            self.assertIn('credits', self.events(self.post())[-1]['message'])

    def test_failure_after_partial_still_sends_error(self):
        def interrupted():
            yield SimpleNamespace(type='image_edit.partial_image', b64_json='preview')
            raise backend.OpenAIError('interrupted')
        with patch.object(backend.client.images, 'edit') as edit:
            edit.return_value.__enter__.return_value = interrupted()
            self.assertEqual([e['type'] for e in self.events(self.post())],
                             ['status', 'preview', 'error'])


if __name__ == '__main__':
    unittest.main()
