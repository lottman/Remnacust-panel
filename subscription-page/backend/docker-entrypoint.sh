#!/bin/sh

echo "Starting entrypoint script..."
export INTERNAL_JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")


echo "Entrypoint script completed."
exec "$@"