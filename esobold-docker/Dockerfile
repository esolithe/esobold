FROM nvidia/cuda:13.1.1-cudnn-runtime-ubuntu24.04

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl unzip aria2 git-all \
    && rm -rf /var/lib/apt/lists/*

# Create working directory
WORKDIR /app
RUN mkdir /app/models && chmod 755 /app/models
RUN mkdir /app/configs && chmod 755 /app/configs
RUN mkdir /app/data && chmod 755 /app/data

# Download latest Esobold CUDA binary and extract it
RUN curl -L -o kcpp.zip https://github.com/Esolithe/KoboldCpp/releases/latest/download/kcpp_linux_binary.zip \
    && unzip kcpp.zip koboldcpp-linux-x64 \
    && rm -f kcpp.zip koboldcpp-linux-x64-nocuda \
    && chmod +x koboldcpp-linux-x64

WORKDIR /app/configs
RUN git clone --depth 1 https://huggingface.co/koboldcpp/newbie-templates
RUN git clone --depth 1 https://huggingface.co/koboldcpp/kcppt
RUN cp -r newbie-templates/* .
RUN cp -r kcppt/* .
RUN rm -rf newbie-templates
RUN rm -rf kcppt
ADD Default.kcpps /app/configs/0_Default.kcpps

WORKDIR /app/models
# Entrypoint to run Esobold
ENTRYPOINT ["/app/koboldcpp-linux-x64"]