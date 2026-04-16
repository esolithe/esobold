#!/bin/bash

if [ ! -f "bin/micromamba" ]; then
	curl -Ls https://anaconda.org/conda-forge/micromamba/1.5.3/download/linux-64/micromamba-1.5.3-0.tar.bz2 | tar -xvj bin/micromamba
fi

resolve_python_suffix() {
	if [ -z "$KCPP_PYTHON_VERSION" ]; then
		echo ""
		return 0
	fi

	case "$KCPP_PYTHON_VERSION" in
		3.10)
			echo "-py310"
			;;
		*)
			echo "Unsupported KCPP_PYTHON_VERSION: $KCPP_PYTHON_VERSION"
			return 1
			;;
	esac
}

resolve_cuda_env_file() {
	local python_suffix="$1"
	case "$KCPP_CUDA" in
		""|12.1.0)
			echo "environment${python_suffix}.yaml"
			;;
		11.5.0)
			echo "environment-cuda115${python_suffix}.yaml"
			;;
		rocm)
			echo "environment-nocuda${python_suffix}.yaml"
			;;
		*)
			echo "Unsupported KCPP_CUDA: $KCPP_CUDA"
			return 1
			;;
	esac
}

python_suffix=$(resolve_python_suffix) || exit 1
selected_env_file=$(resolve_cuda_env_file "$python_suffix") || exit 1

env_needs_rebuild=0
if [ ! -f "conda/envs/linux/envspec" ] || [ "$(<conda/envs/linux/envspec)" != "$selected_env_file" ]; then
	env_needs_rebuild=1
fi

if [[ (! -f "conda/envs/linux/bin/python" || $1 == "rebuild" || $env_needs_rebuild -eq 1) && $KCPP_CUDA != "rocm" ]]; then
	if [ -z "$KCPP_CUDA" ]; then
		KCPP_CUDA=12.1.0
	fi
	bin/micromamba create --no-rc --no-shortcuts -r conda -p conda/envs/linux -f "$selected_env_file" -y
	bin/micromamba create --no-rc --no-shortcuts -r conda -p conda/envs/linux -f "$selected_env_file" -y
	bin/micromamba run -r conda -p conda/envs/linux make clean
	echo $KCPP_CUDA > conda/envs/linux/cudaver
	echo "$selected_env_file" > conda/envs/linux/envspec
fi

if [[ (! -f "conda/envs/linux/bin/python" || $1 == "rebuild" || $env_needs_rebuild -eq 1) && $KCPP_CUDA == "rocm" ]]; then
	bin/micromamba create --no-rc --no-shortcuts -r conda -p conda/envs/linux -f "$selected_env_file" -y
	bin/micromamba run -r conda -p conda/envs/linux make clean
	echo "rocm" > conda/envs/linux/cudaver
	echo "$selected_env_file" > conda/envs/linux/envspec
fi

KCPP_CUDA=$(<conda/envs/linux/cudaver)
KCPP_CUDAAPPEND=-cuda${KCPP_CUDA//.}$KCPP_APPEND

LLAMA_NOAVX1_FLAG=""
LLAMA_NOAVX2_FLAG=""
ARCHES_FLAG=""
NO_WMMA_FLAG=""
if [ -n "$NOAVX2" ]; then
	LLAMA_NOAVX2_FLAG="LLAMA_NOAVX2=1"
fi
if [ -n "$NOAVX1" ]; then
	LLAMA_NOAVX1_FLAG="LLAMA_NOAVX1=1"
fi
if [ -n "$ARCHES_CU11" ]; then
	ARCHES_FLAG="LLAMA_ARCHES_CU11=1"
fi
if [ -n "$ARCHES_CU12" ]; then
	ARCHES_FLAG="LLAMA_ARCHES_CU12=1"
fi
if [ -n "$ARCHES_CU13" ]; then
	ARCHES_FLAG="LLAMA_ARCHES_CU13=1"
fi
if [ -n "$NO_WMMA" ]; then
	NO_WMMA_FLAG="LLAMA_NO_WMMA=1"
fi

if [ "$KCPP_CUDA" = "rocm" ]; then
	bin/micromamba run -r conda -p conda/envs/linux make -j$(nproc) LLAMA_VULKAN=1 LLAMA_HIPBLAS=1 LLAMA_PORTABLE=1 LLAMA_USE_BUNDLED_GLSLC=1 LLAMA_ADD_CONDA_PATHS=1 $LLAMA_NOAVX1_FLAG $LLAMA_NOAVX2_FLAG $ARCHES_FLAG $NO_WMMA_FLAG
else
	bin/micromamba run -r conda -p conda/envs/linux make -j$(nproc) LLAMA_VULKAN=1 LLAMA_CUBLAS=1 LLAMA_PORTABLE=1 LLAMA_USE_BUNDLED_GLSLC=1 LLAMA_ADD_CONDA_PATHS=1 $LLAMA_NOAVX1_FLAG $LLAMA_NOAVX2_FLAG $ARCHES_FLAG $NO_WMMA_FLAG
fi

if [ $? -ne 0 ]; then
    echo "Error: make failed."
    exit 1
fi
bin/micromamba run -r conda -p conda/envs/linux chmod +x "./create_ver_file.sh"
bin/micromamba run -r conda -p conda/envs/linux ./create_ver_file.sh

if [[ $1 == "rebuild" ]]; then
	echo Rebuild complete, you can now try to launch Koboldcpp.
elif [[ $1 == "dist" ]]; then
	bin/micromamba remove --no-rc -r conda -p conda/envs/linux --force ocl-icd -y
	bin/micromamba run -r conda -p conda/envs/linux pyinstaller --noconfirm --onedir --collect-all customtkinter --collect-all jinja2 --collect-all psutil --collect-all pdfplumber --collect-all PyMuPdf --collect-all tqdm --collect-all chardet --collect-all openai --collect-all tiktoken --collect-all prompt_toolkit --collect-all msgpack --collect-all pyyaml --collect-all json-repair --collect-all aiofiles --collect-all python-ulid --collect-all requests --collect-all flask --collect-all discord.py --collect-all python-telegram-bot --collect-all matrix-nio --add-data "./esoExtras/opticlaw:./esoExtras/opticlaw" --add-data './koboldcpp.py:.' --add-data './json_to_gbnf.py:.' --version-file './version.txt' --clean --console koboldcpp.py -n "koboldcpp-launcher"
	if [ "$KCPP_CUDA" = "rocm" ]; then
		if [ ! -n "$ROCM_PATH" ]; then
			ROCM_PATH=/opt/rocm
		fi
		if [ -n "$NOAVX1" ]; then
			bin/micromamba run -r conda -p conda/envs/linux pyinstaller --noconfirm --onefile --collect-all customtkinter --collect-all jinja2 --collect-all psutil --collect-all pdfplumber --collect-all PyMuPdf --collect-all tqdm --collect-all chardet --collect-all openai --collect-all tiktoken --collect-all prompt_toolkit --collect-all msgpack --collect-all pyyaml --collect-all json-repair --collect-all aiofiles --collect-all python-ulid --collect-all requests --collect-all flask --collect-all discord.py --collect-all python-telegram-bot --collect-all matrix-nio --add-data "./esoExtras/opticlaw:./esoExtras/opticlaw" --add-data './dist/koboldcpp-launcher/koboldcpp-launcher:.' --add-data './koboldcpp_hipblas.so:.' --add-data './koboldcpp_failsafe.so:.' --add-data './koboldcpp_noavx2.so:.' --add-data './koboldcpp_vulkan_failsafe.so:.' --add-data './koboldcpp_vulkan_noavx2.so:.' --add-data './kcpp_adapters:./kcpp_adapters' --add-data './koboldcpp.py:.' --add-data './json_to_gbnf.py:.' --add-data './LICENSE.md:.' --add-data './MIT_LICENSE_GGML_SDCPP_LLAMACPP_ONLY.md:.' --add-data './embd_res:./embd_res' --add-data "$ROCM_PATH/lib/rocblas:." --add-data "$ROCM_PATH/lib/libamd_comgr.so:." --version-file './version.txt' --clean --console koboldcpp.py -n "koboldcpp-linux-x64-rocm"
		elif [ -n "$NOAVX2" ]; then
			bin/micromamba run -r conda -p conda/envs/linux pyinstaller --noconfirm --onefile --collect-all customtkinter --collect-all jinja2 --collect-all psutil --collect-all pdfplumber --collect-all PyMuPdf --collect-all tqdm --collect-all chardet --collect-all openai --collect-all tiktoken --collect-all prompt_toolkit --collect-all msgpack --collect-all pyyaml --collect-all json-repair --collect-all aiofiles --collect-all python-ulid --collect-all requests --collect-all flask --collect-all discord.py --collect-all python-telegram-bot --collect-all matrix-nio --add-data "./esoExtras/opticlaw:./esoExtras/opticlaw" --add-data './dist/koboldcpp-launcher/koboldcpp-launcher:.' --add-data './koboldcpp_hipblas.so:.' --add-data './koboldcpp_failsafe.so:.' --add-data './koboldcpp_noavx2.so:.' --add-data './koboldcpp_vulkan_failsafe.so:.' --add-data './koboldcpp_vulkan_noavx2.so:.' --add-data './kcpp_adapters:./kcpp_adapters' --add-data './koboldcpp.py:.' --add-data './json_to_gbnf.py:.' --add-data './LICENSE.md:.' --add-data './MIT_LICENSE_GGML_SDCPP_LLAMACPP_ONLY.md:.' --add-data './embd_res:./embd_res' --add-data "$ROCM_PATH/lib/rocblas:." --add-data "$ROCM_PATH/lib/libamd_comgr.so:." --version-file './version.txt' --clean --console koboldcpp.py -n "koboldcpp-linux-x64-rocm"
		else
			bin/micromamba run -r conda -p conda/envs/linux pyinstaller --noconfirm --onefile --collect-all customtkinter --collect-all jinja2 --collect-all psutil --collect-all pdfplumber --collect-all PyMuPdf --collect-all tqdm --collect-all chardet --collect-all openai --collect-all tiktoken --collect-all prompt_toolkit --collect-all msgpack --collect-all pyyaml --collect-all json-repair --collect-all aiofiles --collect-all python-ulid --collect-all requests --collect-all flask --collect-all discord.py --collect-all python-telegram-bot --collect-all matrix-nio --add-data "./esoExtras/opticlaw:./esoExtras/opticlaw" --add-data './dist/koboldcpp-launcher/koboldcpp-launcher:.' --add-data './koboldcpp_default.so:.' --add-data './koboldcpp_hipblas.so:.' --add-data './koboldcpp_vulkan.so:.' --add-data './koboldcpp_failsafe.so:.' --add-data './koboldcpp_noavx2.so:.' --add-data './koboldcpp_vulkan_noavx2.so:.' --add-data './kcpp_adapters:./kcpp_adapters' --add-data './koboldcpp.py:.' --add-data './json_to_gbnf.py:.' --add-data './LICENSE.md:.' --add-data './MIT_LICENSE_GGML_SDCPP_LLAMACPP_ONLY.md:.' --add-data './embd_res:./embd_res' --add-data "$ROCM_PATH/lib/rocblas:." --add-data "$ROCM_PATH/lib/libamd_comgr.so:." --version-file './version.txt' --clean --console koboldcpp.py -n "koboldcpp-linux-x64-rocm"
		fi
	else
		bin/micromamba run -r conda -p conda/envs/linux pyinstaller --noconfirm --onedir --collect-all customtkinter --collect-all jinja2 --collect-all psutil --collect-all pdfplumber --collect-all PyMuPdf --collect-all tqdm --collect-all chardet --collect-all openai --collect-all tiktoken --collect-all prompt_toolkit --collect-all msgpack --collect-all pyyaml --collect-all json-repair --collect-all aiofiles --collect-all python-ulid --collect-all requests --collect-all flask --collect-all discord.py --collect-all python-telegram-bot --collect-all matrix-nio --add-data "./esoExtras/opticlaw:./esoExtras/opticlaw" --add-data './koboldcpp.py:.' --add-data './json_to_gbnf.py:.' --version-file './version.txt' --clean --console koboldcpp.py -n "koboldcpp-launcher"
		if [ -n "$NOAVX1" ]; then
			bin/micromamba run -r conda -p conda/envs/linux pyinstaller --noconfirm --onefile --collect-all customtkinter --collect-all jinja2 --collect-all psutil --collect-all pdfplumber --collect-all PyMuPdf --collect-all tqdm --collect-all chardet --collect-all openai --collect-all tiktoken --collect-all prompt_toolkit --collect-all msgpack --collect-all pyyaml --collect-all json-repair --collect-all aiofiles --collect-all python-ulid --collect-all requests --collect-all flask --collect-all discord.py --collect-all python-telegram-bot --collect-all matrix-nio --add-data "./esoExtras/opticlaw:./esoExtras/opticlaw" --add-data './dist/koboldcpp-launcher/koboldcpp-launcher:.' --add-data './koboldcpp_cublas.so:.' --add-data './koboldcpp_failsafe.so:.' --add-data './koboldcpp_noavx2.so:.' --add-data './koboldcpp_vulkan_failsafe.so:.' --add-data './koboldcpp_vulkan_noavx2.so:.' --add-data './kcpp_adapters:./kcpp_adapters' --add-data './koboldcpp.py:.' --add-data './json_to_gbnf.py:.' --add-data './LICENSE.md:.' --add-data './MIT_LICENSE_GGML_SDCPP_LLAMACPP_ONLY.md:.' --add-data './embd_res:./embd_res' --version-file './version.txt' --clean --console koboldcpp.py -n "koboldcpp-linux-x64$KCPP_CUDAAPPEND"
		elif [ -n "$NOAVX2" ]; then
			bin/micromamba run -r conda -p conda/envs/linux pyinstaller --noconfirm --onefile --collect-all customtkinter --collect-all jinja2 --collect-all psutil --collect-all pdfplumber --collect-all PyMuPdf --collect-all tqdm --collect-all chardet --collect-all openai --collect-all tiktoken --collect-all prompt_toolkit --collect-all msgpack --collect-all pyyaml --collect-all json-repair --collect-all aiofiles --collect-all python-ulid --collect-all requests --collect-all flask --collect-all discord.py --collect-all python-telegram-bot --collect-all matrix-nio --add-data "./esoExtras/opticlaw:./esoExtras/opticlaw" --add-data './dist/koboldcpp-launcher/koboldcpp-launcher:.' --add-data './koboldcpp_cublas.so:.' --add-data './koboldcpp_failsafe.so:.' --add-data './koboldcpp_noavx2.so:.' --add-data './koboldcpp_vulkan_failsafe.so:.' --add-data './koboldcpp_vulkan_noavx2.so:.' --add-data './kcpp_adapters:./kcpp_adapters' --add-data './koboldcpp.py:.' --add-data './json_to_gbnf.py:.' --add-data './LICENSE.md:.' --add-data './MIT_LICENSE_GGML_SDCPP_LLAMACPP_ONLY.md:.' --add-data './embd_res:./embd_res' --version-file './version.txt' --clean --console koboldcpp.py -n "koboldcpp-linux-x64$KCPP_CUDAAPPEND"
		else
			bin/micromamba run -r conda -p conda/envs/linux pyinstaller --noconfirm --onefile --collect-all customtkinter --collect-all jinja2 --collect-all psutil --collect-all pdfplumber --collect-all PyMuPdf --collect-all tqdm --collect-all chardet --collect-all openai --collect-all tiktoken --collect-all prompt_toolkit --collect-all msgpack --collect-all pyyaml --collect-all json-repair --collect-all aiofiles --collect-all python-ulid --collect-all requests --collect-all flask --collect-all discord.py --collect-all python-telegram-bot --collect-all matrix-nio --add-data "./esoExtras/opticlaw:./esoExtras/opticlaw" --add-data './dist/koboldcpp-launcher/koboldcpp-launcher:.' --add-data './koboldcpp_default.so:.' --add-data './koboldcpp_cublas.so:.' --add-data './koboldcpp_vulkan.so:.' --add-data './koboldcpp_failsafe.so:.' --add-data './koboldcpp_noavx2.so:.' --add-data './koboldcpp_vulkan_noavx2.so:.' --add-data './kcpp_adapters:./kcpp_adapters' --add-data './koboldcpp.py:.' --add-data './json_to_gbnf.py:.' --add-data './LICENSE.md:.' --add-data './MIT_LICENSE_GGML_SDCPP_LLAMACPP_ONLY.md:.' --add-data './embd_res:./embd_res' --version-file './version.txt' --clean --console koboldcpp.py -n "koboldcpp-linux-x64$KCPP_CUDAAPPEND"
			bin/micromamba run -r conda -p conda/envs/linux pyinstaller --noconfirm --onefile --collect-all customtkinter --collect-all jinja2 --collect-all psutil --collect-all pdfplumber --collect-all PyMuPdf --collect-all tqdm --collect-all chardet --collect-all openai --collect-all tiktoken --collect-all prompt_toolkit --collect-all msgpack --collect-all pyyaml --collect-all json-repair --collect-all aiofiles --collect-all python-ulid --collect-all requests --collect-all flask --collect-all discord.py --collect-all python-telegram-bot --collect-all matrix-nio --add-data "./esoExtras/opticlaw:./esoExtras/opticlaw" --add-data './dist/koboldcpp-launcher/koboldcpp-launcher:.' --add-data './koboldcpp_default.so:.' --add-data './koboldcpp_vulkan.so:.' --add-data './koboldcpp_failsafe.so:.' --add-data './koboldcpp_noavx2.so:.' --add-data './koboldcpp_vulkan_noavx2.so:.' --add-data './kcpp_adapters:./kcpp_adapters' --add-data './koboldcpp.py:.' --add-data './json_to_gbnf.py:.' --add-data './LICENSE.md:.' --add-data './MIT_LICENSE_GGML_SDCPP_LLAMACPP_ONLY.md:.' --add-data './embd_res:./embd_res' --version-file './version.txt' --clean --console koboldcpp.py -n "koboldcpp-linux-x64-nocuda$KCPP_APPEND"
		fi
	fi
	bin/micromamba install --no-rc -r conda -p conda/envs/linux ocl-icd -c conda-forge -y
else
	bin/micromamba run -r conda -p conda/envs/linux python koboldcpp.py $*
fi
