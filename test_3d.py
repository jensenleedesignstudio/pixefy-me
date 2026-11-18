from gradio_client import Client, handle_file

client = Client("stabilityai/stable-fast-3d")
image = handle_file("public/cat-3d-input.png")

client.predict(image, api_name="/requires_bg_remove")
_, model_path = client.predict(
    "Run",
    image,
    0.85,
    "None",
    -1,
    1024,
    api_name="/run_button",
)

print("Model file:", model_path["value"])