ARG IMAGE=ubuntu:24.04

FROM ${IMAGE} AS local

LABEL NAME="orchestrator"
LABEL MAINTAINER="charandeep.matta@gmail.com"

ENV DEBIAN_FRONTEND=noninteractive

COPY apt-packages.txt /tmp/apt-packages.txt
RUN apt-get update -y && \
    apt-get --fix-broken -y install && \
    apt-get upgrade -y && \
    apt-get install software-properties-common -y  && \
    apt-get update -y && \
    xargs apt-get -y install < /tmp/apt-packages.txt

### Install Python UV
ARG UV_VERSION="0.9.9"
RUN apt-get install pipx -y && \
    pipx ensurepath && \
    pipx install uv==${UV_VERSION}

### Install Go
ARG GO_VERSION="1.25.4"
RUN UNAME_M=$(uname -m) && GO_ARCH=$([ "$UNAME_M" = "x86_64" ] && echo "amd64" || echo "arm64") && \
    echo "Detected architecture: ${UNAME_M}" && \
    echo "Setting GO_ARCH: ${GO_ARCH}" && \
    curl -#LO https://go.dev/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz && \
    rm -rf /usr/local/go && \
    tar -C /usr/local -xzf go${GO_VERSION}.linux-${GO_ARCH}.tar.gz && \
    rm go${GO_VERSION}.linux-${GO_ARCH}.tar.gz
ENV PATH=$PATH:/usr/local/go/bin:/root/go/bin

### taskfile.dev
RUN sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d -b ~/.local/bin

### Install Node
ARG NODE_VERSION="24"
RUN curl -fsSL https://fnm.vercel.app/install | bash && /root/.local/share/fnm/fnm install ${NODE_VERSION}

### Alias
RUN echo "alias g='git'" >> ~/.bashrc
RUN echo "export EDITOR='vim'" >> ~/.bashrc
