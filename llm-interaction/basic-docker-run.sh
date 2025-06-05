input_dir=$(dirname "$input_path")
fname=$(basename "$input_path")
output_path="/home/gc/Desktop/MEIC/ano-2/tese/explode-js_ng/llm-interaction/dist/"
checkpoint_path="/home/gc/Desktop/MEIC/ano-2/tese/explode-js_ng/llm-interaction/.checkpoint.json"
# Build docker image if it does not exist
if [ -z "$(docker images -q llmint)" ]; then
    docker build . -t llmint
fi


docker run -it --rm \
  -e GEMINI_KEY="$GEMINI_KEY" \
  -v "/home/gc/Desktop/MEIC/ano-2/tese/explode-js_ng/llm-interaction/dist":"/home/gc/Desktop/MEIC/ano-2/tese/explode-js_ng/llm-interaction/dist" \
  -v "/home/gc/Desktop/MEIC/ano-2/tese/explode-js_ng/llm-interaction/.checkpoint.json":"/home/gc/Desktop/MEIC/ano-2/tese/explode-js_ng/llm-interaction/.checkpoint.json":rw \
  llmint

