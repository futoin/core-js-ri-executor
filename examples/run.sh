#!/bin/bash

# Does not work with partial includes
#export NODE_PATH="$(realpath $(dirname $0)/..)"

mkdir -p node_modules
ln -sfn ../.. node_modules/futoin-executor

echo "Starting Example Server"
node ./example_server.js &
pid=$!

sleep 1
echo "Starting Example Client"
node ./example_client.js

echo "Starting Example Client with Callback"
node ./callback_client.js

kill $pid
#rm node_modules -rf
