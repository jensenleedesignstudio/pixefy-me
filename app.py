from flask import Flask, request, send_file
from io import BytesIO
from dotenv import load_dotenv
from openai import OpenAI, RateLimitError
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

    if sketch is None: 
        return "no sketch received", 400

    try: 
        result = client.images.edit(
            model = "gpt-image-2.6-sunburst",
            image = ("sketch.png", sketch.read(), "image/png"),

            prompt = (""
            "use the uploaded sketch as the blueprint for a finished retro pixelated art scene. "
            "tnterpret what the artist is drawing from the shapes, lines, and visual clues. "
            "preserve the number and placement of the main subjects, their poses and silhouettes, "
            "and distinctive details like expressions, accessories, or handwritten text. "
            "complete unfinished outlines and fill in missing parts in ways that fit the sketch. "
            "if a detail is ambiguous, choose the simplest interpretation that fits the visible lines. "
            "add colour, simple shading, and pixel details that make each subject easy to recognize. "
            "create a background that fits the scene and keeps the main subjects easy to see. "
            "use crisp square pixels, a limited colour palette, and clean outlines throughout."
            ),
            output_format = "png",
    )

    except RateLimitError:
        return "image generation is unavailable. check your API credits and limits.", 429

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

    

