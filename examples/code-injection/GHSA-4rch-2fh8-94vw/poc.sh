#!/bin/bash

TEST_EXPLOIT=${TEST_EXPLOIT:-false}

echo "Starting MySQL server"
docker run --rm -d \
  --name poc-mysql \
  -e MYSQL_ROOT_PASSWORD=123456 \
  -e MYSQL_DATABASE=test \
  -p 3306:3306 \
  mysql:latest

echo "Waiting for MySQL to be ready..."
until docker exec poc-mysql mysqladmin ping -h "127.0.0.1" -uroot -p123456 --silent; do
  sleep 1
done

echo "Running poc..."
if [ "$TEST_EXPLOIT" = true ]; then
  node test-exploit.js
else
  node poc.js
fi

echo "Stopping MySQL server"
docker stop poc-mysql
