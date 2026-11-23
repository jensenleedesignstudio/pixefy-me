from flask import Flask, request, send_file
from io import BytesIO
from dotenv import load_dotenv
from openai import OpenAI, RateLimitError, BadRequestError
from base64 import b64decode
from pathlib import Path
from tempfile import TemporaryDirectory
from gradio_client import Client, handle_file
import os

app = Flask(__name__, static_folder = "public", static_url_path = "/static")

load_dotenv()
client = OpenAI()

@app.route("/")
def home ():
    return "pixefy me backend is running!"


# /generate: where generate pixel art button will send image to (POST is the method of sending)
@app.route("/generate", methods = ["POST"])
def generate(): 
    sketch = request.files.get("sketch")
    instructions = request.form.get("instructions", "").strip()

    if sketch is None: 
        return "no sketch received", 400

    try: 
        result = client.images.edit(
            model = "gpt-image-2.6-sunburst",
            complexity = "medium",
            image = ("sketch.png", sketch.read(), "image/png"),

            prompt = f"""
                turn the supplied sketch or photo into one complete cartoon character.

                if the canvas is empty, create a character called nothing. an empty canvas
                has only a background or transparency. even one visible dot, line, or shape
                counts as a drawing. for nothing, draw a simple black stick man with a solid
                round head, a thin line for the body, two line arms, and two line legs. centre
                him on a plain light background. leave his face blank and his name off the
                image. for an empty canvas, this rule takes priority over all instructions below.

                for a non-empty canvas, build directly from what the person drew. start with
                the outer silhouette, then follow the proportions, pose, expression, colours,
                markings, and placement of each feature. treat unusual shapes and asymmetry
                as deliberate. if one ear is oversized or the eyes sit low on the body,
                carry that choice into the finished character.

                if several distinctive features clearly point to a familiar animal, object,
                or existing character, use that recognition to work out missing details.
                if a matching reference image is supplied, use it for the same purpose.
                if the subject is ambiguous, let the drawing itself define the character.
                follow unfinished curves, bridge small gaps where the lines clearly continue,
                and preserve openings that look intentional.

                make the character feel finished through the shapes already present. give
                a drawn flipper thickness, a folded sleeve a crease, or a raised feature a
                soft shadow where it meets the body. use rounded edges, subtle highlights,
                and gentle changes in colour to show depth. add limbs, facial features,
                clothing, markings, or accessories only when the drawing or the user's
                instructions give a clear reason for them. a simple design can stay simple.

                render the result as a softly shaded 3d cartoon figurine. 
                light the character with a large, soft light from the upper left. let painted
                markings follow the curve of the body. give raised features a soft shadow
                where they meet the surface. use broad highlights on matte surfaces and
                small, sharper highlights on smooth details already present in the sketch.
                preserve the drawn colours where provided and choose a restrained palette for 
                uncoloured areas. use a gentle three-quarter view if it keeps the silhouette and 
                pose easy to recognise. otherwise, keep the original angle and show volume through 
                lighting. show the entire character against a plain light background with a little 
                space on every side.

                apply the user's instructions to the specific features they mention. use the
                original drawing as the guide for everything else.

                additional character instructions from the user:
                {instructions.strip() or "(none)"}
                """,

            output_format = "png",
    )

    except RateLimitError:
        return "image generation is unavailable. check your API credits and limits.", 429

    except BadRequestError:
        return (
            "The image request could not be processed. "
            "Please review your image and instructions.",
            400,
        )

    image_bytes = b64decode(result.data[0].b64_json)
    return send_file(BytesIO(image_bytes), mimetype = "image/png")

@app.route("/generate-3d", methods=["POST"])
def generate_3d():
    image = request.files.get("image")

    if image is None:
        return "No image received.", 400

    with TemporaryDirectory() as folder:
        image_path = Path(folder) / "pixel-art.png"
        image.save(image_path)

        hf_client = Client(
            "stabilityai/stable-fast-3d",
            token=os.environ["HF_TOKEN"],
        )
        uploaded_image = handle_file(str(image_path))

        preparation = hf_client.predict(
            uploaded_image,
            api_name="/requires_bg_remove",
        )

        background_preview = preparation[0]

        if isinstance(background_preview, dict):
            background_preview = background_preview.get("value")

        if not background_preview:
            hf_client.predict(
                "Remove Background",
                uploaded_image,
                0.85,
                "None",
                -1,
                1024,
                api_name="/run_button",
            )

        _, model_result = hf_client.predict(
            "Run",
            uploaded_image,
            0.85,
            "None",
            -1,
            1024,
            api_name="/run_button",
        )

        model_path = model_result["value"]
        model_bytes = Path(model_path).read_bytes()

        return send_file(
            BytesIO(model_bytes),
            mimetype="model/gltf-binary",
            download_name="character.glb",
        )

    

