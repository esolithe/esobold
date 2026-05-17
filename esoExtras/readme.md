Several dependencies are currently added to the overall project PyInstallers.  The places to update can be found with "customtkinter"

```
pdfplumber PyMuPdf tqdm chardet tree-sitter tree-sitter-python tree-sitter-javascript tree-sitter-typescript tree-sitter-html tree-sitter-css tree-sitter-cpp tree-sitter-c-sharp tree-sitter-rust tree-sitter-ruby tree-sitter-go tree-sitter-java openai tiktoken prompt_toolkit msgpack pyyaml json-repair aiofiles python-ulid requests fastapi uvicorn discord.py python-telegram-bot matrix-nio beautifulsoup4

--collect-all pdfplumber --collect-all PyMuPdf --collect-all fitz --collect-all tqdm --collect-all chardet --collect-all openai --collect-all tiktoken --hidden-import=tiktoken_ext.openai_public --hidden-import=tiktoken_ext --collect-all prompt_toolkit --collect-all msgpack --collect-all yaml --collect-all json_repair --collect-all aiofiles --collect-all ulid --collect-all requests --collect-all fastapi --collect-all uvicorn --collect-all discord --collect-all telegram --collect-all matrix-nio --collect-all bs4 --add-data "./esoExtras:./esoExtras"

- customtkinter
- pdfplumber
- PyMuPdf
- tqdm
- openai
- tiktoken
- prompt_toolkit
- msgpack
- pyyaml
- json-repair
- aiofiles
- python-ulid
- requests
- fastapi
- uvicorn
- discord.py
- python-telegram-bot
- matrix-nio
- beautifulsoup4
```