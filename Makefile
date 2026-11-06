SHELL := /bin/bash

NODE_VERSION ?= 24
NVM_DIR ?= $(HOME)/.nvm
NAME := $(shell node -p "require('./package.json').name" 2>/dev/null || echo dogclap)

# Every recipe runs inside a shell that has nvm loaded and the chosen node active.
NVM := . "$(NVM_DIR)/nvm.sh" && nvm use $(NODE_VERSION) >/dev/null

.PHONY: all build install check media clean

all: build

check:
	@$(NVM) && node --check src/extension.js && node --check src/commands.js

# Regenerates media/dogclap.gif and media/dogclap.wav from media/dogclap.webm.
# libvpx-vp9 is forced as decoder because ffmpeg's native VP9 decoder drops the alpha channel.
media:
	ffmpeg -y -v error -c:v libvpx-vp9 -i media/dogclap.webm \
		-vf "fps=15,scale=240:-1:flags=lanczos,split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=alpha_threshold=128" \
		-loop 0 media/dogclap.gif
	ffmpeg -y -v error -i media/dogclap.webm -vn -c:a pcm_s16le -ar 44100 media/dogclap.wav

# Builds the .vsix (vsce is fetched on demand by npx; nothing is installed globally)
build: check
	@$(NVM) && node -v && npx --yes @vscode/vsce package --allow-missing-repository --skip-license

# Installs the built .vsix into VS Code
install: build
	code --install-extension $$(ls -t *.vsix | head -1)

clean:
	rm -f *.vsix
