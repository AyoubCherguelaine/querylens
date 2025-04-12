import gradio as gr
import pandas as pd
import os
import tempfile
import shutil

from stream.utils.cube_processor import process_query
from stream.utils.db_processor import extract_cube

# Session-like global state
session_state = {
    "db_path": None,
    "cubes": [],
    "selected_cube": None,
    "chat_history": []
}

# Handle file upload and extract cubes
def handle_upload(file):
    if file is None:
        return gr.update(choices=[]), "Please upload a SQLite `.db` file."
    
    # Just copy the file from Gradio's temp path
    temp_path = file.name
    db_path = os.path.join(tempfile.gettempdir(), os.path.basename(temp_path))
    shutil.copy(temp_path, db_path)

    try:
        cubes = extract_cube(db_path)
        session_state["db_path"] = db_path
        session_state["cubes"] = cubes
        session_state["selected_cube"] = None
        session_state["chat_history"] = []

        cube_names = [cube['name'] for cube in cubes]
        return gr.update(choices=cube_names), "Upload successful. Select a cube to start chatting."
    except Exception as e:
        return gr.update(choices=[]), f"Error reading DB: {e}"

# Set selected cube
def set_cube(cube_name):
    session_state["selected_cube"] = cube_name
    session_state["chat_history"] = []
    return f"Selected Cube: `{cube_name}`", []

# Handle user input and generate cube response
def chat_with_cube(user_input):
    if not session_state["selected_cube"]:
        return session_state["chat_history"] + [("System", "Please select a cube first.")]

    cube = next(c for c in session_state["cubes"] if c["name"] == session_state["selected_cube"])
    message = process_query(user_input, session_state["db_path"], cube)
    session_state["chat_history"].append(("You", user_input))
    session_state["chat_history"].append(("CubeBot", message))
    return session_state["chat_history"]

# Gradio Interface
with gr.Blocks(title="OLAP Cube Chat") as demo:
    gr.Markdown("## 📂 OLAP Cube Chat")

    with gr.Row():
        file_input = gr.File(label="Upload SQLite DB", file_types=[".db"])
        upload_output = gr.Textbox(label="Status", interactive=False)

    cube_selector = gr.Radio(choices=[], label="Available Cubes", interactive=True)
    cube_info = gr.Markdown()

    chatbot = gr.Chatbot(label="Cube Chat")
    with gr.Row():
        txt = gr.Textbox(show_label=False, placeholder="Type your question...")
        send_btn = gr.Button("Send")

    # Events
    file_input.change(fn=handle_upload, inputs=file_input, outputs=[cube_selector, upload_output])
    cube_selector.change(fn=set_cube, inputs=cube_selector, outputs=[cube_info, chatbot])
    send_btn.click(fn=chat_with_cube, inputs=txt, outputs=chatbot)
    txt.submit(fn=chat_with_cube, inputs=txt, outputs=chatbot)

demo.launch()
