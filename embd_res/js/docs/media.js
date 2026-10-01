/*
 * Native guide: media.
 * Sources: newMediaButtons.js, embeddedContentViewer.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_PARTS.media.chapters.push(
    {
        "id": "media-workflow",
        "title": "Images, audio and media controls",
        "blocks": [
            {
                "list": [
                    "Click Media in the story/chat controls to attach or generate supported media. The filesystem button appears in that menu only when the server has file storage enabled.",
                    "Attach a picture if you want an image-capable AI to describe it, or use a configured image model to generate one. Reading an image and creating an image require different model features.",
                    "Transcription turns audio into text and needs a transcription model. Text-to-speech (TTS) reads text aloud using supported voices. Music generation has separate caption, lyrics and timing settings.",
                    "Download media you want to keep. When filesystem tools are enabled, fs_generate_* actions can also save results to a server path."
                ]
            },
            {
                "tip": "Check that the matching media model is available before starting. Attachments go to the selected service, so avoid sending private files to a service you did not intend to use."
            }
        ],
        "show": [
            { label: "Media controls", run: (ctx) => ctx.highlight(() => [...document.querySelectorAll("#btn_addmedia, #btn_addmedia2, #btn_addmedia3")].find(button => button.getClientRects().length > 0), "Click Media to attach or generate supported media") }
        ]
    },
    {
        "id": "images-and-backgrounds",
        "title": "Image understanding, generation and backgrounds",
        "blocks": [
            {
                "table": [
                    [
                        "Operation",
                        "What it does"
                    ],
                    [
                        "describe_clicked_image",
                        "Lets you click an image and ask the AI a question about it."
                    ],
                    [
                        "describe_fs_image",
                        "Asks an image-capable AI about an image stored on the server."
                    ],
                    [
                        "generate_image",
                        "Creates an image in chat. edit_existing_image requests editing an existing image when supported."
                    ],
                    [
                        "fs_generate_image",
                        "Creates or edits an image and saves it at fs_output_path. Existing images can be supplied by their server paths."
                    ],
                    [
                        "set_background_image_from_filesystem",
                        "Sets a server image as the story/chat background."
                    ]
                ]
            },
            {
                "p": "Choose the aspect ratio for the shape you want, such as a wide landscape. The image model determines supported sizes. Image preparation may ask an AI to refine your description first, which uses an extra request."
            },
            {
                "tip": "Image descriptions and text read from pictures can contain mistakes. Keep the original and check important details."
            }
        ]
    },
    {
        "id": "audio-and-music",
        "title": "Transcription, voices and music",
        "blocks": [
            {
                "list": [
                    "To transcribe a stored recording, fs_transcribe takes its path and optional language or background hints. Non-speech suppression can exclude sounds that are not words; the server must support transcription.",
                    "generate_tts reads text aloud; fs_generate_tts also saves the audio to a path. Choose an available server voice or a supported custom voice.",
                    "music_prepare helps prepare the music description. fs_generate_music creates a saved track using caption/lyrics, tempo, duration, key, time signature, vocal language and generation steps, with optional input audio.",
                    "If generation fails, read the error before retrying. Check the reported saved path or download result before assuming you have a copy."
                ]
            },
            {
                "tip": "Audio, images and music use storage space. Check the saved result and download or back up files you want to keep."
            }
        ]
    },
    {
        "id": "embedded-viewer",
        "title": "Embedded content and floating viewers",
        "blocks": [
            {
                "list": [
                    "Embedded content means a file displayed inside the page, such as an image in a small movable window. The embedded-content button beside supported agent controls opens a file picker for this.",
                    "Choose a supported image, audio or video file. fs_open_embed opens a floating viewer with a name, position and size; fs_close_embed closes the viewer by name.",
                    "Move, enlarge or close a viewer as needed. Opening the same name again updates that viewer; the viewer itself is not another saved copy of the file.",
                    "Displaying a file does not send it to the AI. HTML or other active content may run code, so only open content you trust."
                ]
            },
            {
                "tip": "Embedded files are served by the server using its normal access rules. Check what you are displaying before sharing a file link."
            }
        ]
    }
)
