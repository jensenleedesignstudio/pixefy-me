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
    instructions = request.form.get("instructions", "").strip()

    if sketch is None: 
        return "no sketch received", 400

    try: 
        result = client.images.edit(
            model = "gpt-image-2.6-sunburst",
            image = ("sketch.png", sketch.read(), "image/png"),

            prompt=(
                "transform the supplied sketch into a complete, three-dimensional cartoon character. "
                "infer what the drawing represents from its shapes, facial features, pose, "
                "and any written character instructions. "
                "build directly from the sketch rather and do not replace it with a generic character. "
                "unless stated otherise by the user instrctions"

                "preserve the original silhouette, proportions, expression, pose, asymmetry, "
                "distinctive markings, colours, and accessories wherever they are shown. "
                "treat unusual shapes and proportions as intentional design choices. "

                "interpret rough lines as guides to the intended forms. "
                "connect disconnected shapes, resolve overlapping sketch lines, and fill small gaps "
                "to create a coherent character while retaining the original design. "
                "invent only the missing details needed to complete it. "
                "do not add limbs, ears, tails, clothing, or accessories unless the sketch "
                "or the user's instructions suggest them. "

                "render the result as a softly shaded 3D figurine with solid, rounded forms "
                "and clear depth. Translate drawn outlines into actual edges and volumes "
                "rather than black lines painted onto a flat surface. "
                "use the sketch's colours where provided; otherwise choose a restrained, "
                "harmonious palette appropriate to the character. "

                "show one complete character in a three-quarter view, keeping its pose "
                "as close to the reference as possible. "
                "keep visible limbs and accessories distinguishable. "
                "centre the entire character with space around it against a plain light background. "
                "Use soft, even lighting, without scenery, text, or additional characters. "

                "apply the user's instructions to the requested features. "
                "preserve the rest of the sketch wherever those instructions do not request a change. "
                f"\nAdditional character instructions from the user: {instructions}"
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

    

