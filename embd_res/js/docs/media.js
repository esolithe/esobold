/*
 * Native guide: media.
 * Sources: newMediaButtons.js, embeddedContentViewer.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
        "id": "media-workflow",
        "title": "Images, audio and media controls",
        "blocks": [
            {
                "list": [
                    "Open Add Media for supported image, audio and other media actions. The filesystem button is injected only when the backend advertises filesystem support.",
                    "Attach images for a vision-capable endpoint, or request image generation through the configured image backend. Image generation, image understanding and text generation are separate capabilities.",
                    "Audio transcription requires the backend’s transcription capability. TTS requires supported voices/model data; music generation uses its own caption/lyrics and timing controls.",
                    "Generated/displayed media can be kept in filesystem paths through the fs_generate_* tools, or shown through the chat/media controls. Choose persistent storage if you need the result after the session ends."
                ]
            },
            {
                "tip": "A visible UI control is not proof that the matching model is loaded. Check capability/version reports and avoid sending private attachments to an unintended remote service."
            }
        ],
        "show": [
            { label: "Media controls", run: (ctx) => ctx.highlight("#addmediacontainer", "Attach or generate supported media") }
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
                        "Asks the user to select an image and sends a question plus image data to the model."
                    ],
                    [
                        "describe_fs_image",
                        "Reads an image from the backend filesystem and asks the vision model about it."
                    ],
                    [
                        "generate_image",
                        "Generates a chat image; edit_existing_image can request an image-editing path."
                    ],
                    [
                        "fs_generate_image",
                        "Generates/edits an image and writes the result to fs_output_path, optionally using input image paths."
                    ],
                    [
                        "set_background_image_from_filesystem",
                        "Uses a backend filesystem image as a persistent story/chat background."
                    ]
                ]
            },
            {
                "p": "Aspect selection and the configured image backend determine output shape. Image preparation can ask an AI to refine a generation prompt; that is another model request, not a lossless transformation of the original image."
            },
            {
                "tip": "A visual description or OCR-like answer can be wrong. Preserve the original file and verify important details independently."
            }
        ]
    },
    {
        "id": "audio-and-music",
        "title": "Transcription, voices and music",
        "blocks": [
            {
                "list": [
                    "fs_transcribe takes an input path plus optional context/language and non-speech suppression choices. The backend must support the selected transcription operation.",
                    "generate_tts speaks text through the supported backend; fs_generate_tts additionally writes audio to a chosen path. Select a voice from the server-supported list or the available custom voice route.",
                    "music_prepare prepares caption/music state. fs_generate_music accepts caption/lyrics, tempo, duration, key scale, time signature, vocal language and inference steps, plus optional input and an output path.",
                    "Treat image/music/audio generation failures as failures: do not assume that an output path was written or that a chat media element means an export succeeded."
                ]
            },
            {
                "tip": "Media writes can consume filesystem quota/disk space. Read the operation result and download or back up wanted assets."
            }
        ]
    },
    {
        "id": "embedded-viewer",
        "title": "Embedded content and floating viewers",
        "blocks": [
            {
                "list": [
                    "The embedded-content viewer button appears alongside agent controls in supported presentations. It opens a filesystem picker in embedded-selection mode.",
                    "Choose supported images, audio, video or other embeddable content. fs_open_embed creates a named floating viewer with position/size; fs_close_embed closes that name.",
                    "Floating viewers can be moved, raised, expanded and closed. Reusing a name updates/replaces the viewer rather than creating unrelated permanent storage.",
                    "Embedding a file displays it; it does not upload it into a model request or guarantee that active HTML/content is sandboxed."
                ]
            },
            {
                "tip": "Use only trusted executable/HTML content. An embedded URL may expose a file through the backend’s normal authenticated file-serving route."
            }
        ]
    }
)
