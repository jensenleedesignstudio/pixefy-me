from flask import Flask, request, send_file
from io import BytesIO
from dotenv import load_dotenv
from openai import OpenAI
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

    result = client.images.edit(
        model = "gpt-image-2.6-sunburst",
        image = ("sketch.png", sketch.read(), "image/png"),

        prompt = ("turn this sketch into a full retro pixel art. preserve the subjects, poss, "
        "and layout. use crisp pixel edges and a limited pallete "
        ),
        output_format = "png",
    )

    image_bytes = b64decode(result.data[0].b64_json)
    return send_file(BytesIO(image_bytes), mimetype = "image/png")

