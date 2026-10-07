#!/bin/sh
set -eu
cd "$(dirname "$0")"

if [ ! -f server/.env ]; then
  printf '%s\n' 'Create server/.env from server/.env.sample first.' >&2
  exit 1
fi

if [ -L .env ] && [ "$(readlink .env)" = 'server/.env' ]; then
  exit 0
fi

if [ -e .env ] || [ -L .env ]; then
  printf '%s\n' 'Refusing to replace the existing .env.' >&2
  exit 1
fi

ln -s server/.env .env
