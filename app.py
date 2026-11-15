from flask import Flask, request, send_file
from io import BytesIO
from dotenv import load_dotenv
from openai import OpenAI, RateLimitError
from base64 import b64decode

app = Flask(__name__)

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

