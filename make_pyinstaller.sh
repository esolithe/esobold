#!/bin/bash
chmod +x "./create_ver_file.sh"
. create_ver_file.sh
pyinstaller --noconfirm --onefile --clean --console --collect-all customtkinter --collect-all jinja2 --collect-all psutil --collect-all pdfplumber --collect-all PyMuPdf --collect-all tqdm --collect-all chardet --collect-all openai --collect-all tiktoken --collect-all prompt_toolkit --collect-all msgpack --collect-all pyyaml --collect-all json-repair --collect-all aiofiles --collect-all python-ulid --collect-all requests --collect-all flask --collect-all discord.py --collect-all python-telegram-bot --collect-all matrix-nio --add-data "./esoExtras/opticlaw:./esoExtras/opticlaw" --icon "./niko.ico" \
--add-data "./kcpp_adapters:./kcpp_adapters" \
--add-data "./koboldcpp.py:." \
--add-data "./json_to_gbnf.py:." \
--add-data "./LICENSE.md:."  \
--add-data "./MIT_LICENSE_GGML_SDCPP_LLAMACPP_ONLY.md:." \
--add-data "./embd_res:./embd_res" \
--add-data "./koboldcpp_default.so:." \
--add-data "./koboldcpp_failsafe.so:." \
--add-data "./koboldcpp_noavx2.so:." \
--add-data "./koboldcpp_vulkan_failsafe.so:." \
--add-data "./koboldcpp_vulkan_noavx2.so:." \
--add-data "./koboldcpp_vulkan.so:." \
--version-file "./version.txt" \
"./koboldcpp.py" -n "koboldcpp"