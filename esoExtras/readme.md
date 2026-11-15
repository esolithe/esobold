Several dependencies are currently added to the overall project PyInstallers.  The places to update can be found with "customtkinter"

```
pdfplumber PyMuPdf tqdm chardet tree-sitter tree-sitter-python tree-sitter-javascript tree-sitter-typescript tree-sitter-html tree-sitter-css tree-sitter-cpp tree-sitter-c-sharp tree-sitter-rust tree-sitter-ruby tree-sitter-go tree-sitter-java openai tiktoken prompt_toolkit msgpack pyyaml json-repair aiofiles python-ulid requests fastapi uvicorn itsdangerous websockets python-multipart discord.py python-telegram-bot matrix-nio beautifulsoup4 ddgs partial-json-parser filetype tree_sitter_language_pack mcp simpleeval typer tomli rich flask

--collect-all pdfplumber --collect-all PyMuPdf --collect-all fitz --collect-all tqdm --collect-all chardet --collect-all openai --collect-all tiktoken --hidden-import=tiktoken_ext.openai_public --hidden-import=tiktoken_ext --collect-all prompt_toolkit --collect-all msgpack --collect-all yaml --collect-all json_repair --collect-all aiofiles --collect-all ulid --collect-all requests --collect-all fastapi --collect-all uvicorn --collect-all itsdangerous --collect-all websockets --collect-all multipart --collect-all discord --collect-all telegram --collect-all matrix-nio --collect-all bs4 --collect-all ddgs --collect-all mcp --collect-all simpleeval --collect-all typer --add-data "./esoExtras:./esoExtras"

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
- itsdangerous
- websockets
- python-multipart
- discord.py
- python-telegram-bot
- matrix-nio
- beautifulsoup4
- ddgs
- mcp
- simpleeval
- typer
```

Known gotchas and proposed fixes:

- Discord bot channel parse failure
	- Symptom: f-string parser error at esoExtras/opticlaw/channels/discord_bot/channel.py line 267.
	- Why it happens: nested braces in that f-string are malformed.
	- Proposed fix: rewrite the expression as f"> {'...'+line[-244:].rstrip()+'...' if len(line) > 250 else line}" or precompute the truncated value first and inject only a single variable into the f-string.

- Frozen-build dependency warning noise
	- Symptom: warnings that dependencies are missing in frozen/PyInstaller runs even when modules later load.
	- Why it happens: the pre-check relies on metadata lookup and can misreport in bundled runtimes.
	- Proposed fix: in esoExtras/opticlaw/core/modules.py, make missing-dependency detection use requirement parsing plus import-spec probing in frozen mode and downgrade those pre-check warnings to advisory unless import actually fails.