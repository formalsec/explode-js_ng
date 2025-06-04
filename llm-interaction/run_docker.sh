#!/bin/bash

# Get current and parent dir
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PARENT_DIR=$(dirname "${SCRIPT_DIR}")


# Display help
Help()
{
    echo "Usage: ./graphjs_docker.sh -i <path> [options]"
    echo "Description: Run Graph.js for a given input path <path> in a Docker container."
    echo ""
    echo "Required:"
    echo "-i <path>    Input path (path to vulnerabilities folder)"
    echo ""
    echo "Options:"
    echo "-o <path>    Path to store exploit analysis results."
    echo "-m           Use only the specified mode ex:-m simple (Uses all by default)"
    echo "-c           Analyze packages of a specific cwe ex:-c 1321."
    echo "-h           Print this help."
    echo
}

# Default values
FLAGS=""

while getopts i:o:c:m:h flag; do
    case "${flag}" in
        i)
            input_path=$OPTARG
            input_path="$( realpath "$input_path" )"
            if [ ! -f "$input_path" ] && [ ! -d "$input_path" ]; then
                echo "File $OPTARG does not exist."
                exit 1
            fi
            ;;
        o)
            output_path=$OPTARG
            output_path="$( realpath "$output_path" )"
            if [ ! -d "$output_path" ]; then
                echo "Output path $OPTARG does not exist. Creating new directory."
                mkdir -p "$output_path"
            fi
            ;;
        c)
            CONFIG_ARG=$OPTARG
            FLAGS+=" -c $CONFIG_ARG"
            ;;
        m)
            MODE_ARG=$OPTARG
            FLAGS+=" -m $MODE_ARG"
            ;;
        h)
            echo "Usage: $0 -i <input> -o <output> [-c <config>] [-m <mode>] [-h]"
            exit 0
            ;;
        \?)
            echo "Invalid option: -$OPTARG" >&2
            exit 1
            ;;
        :)
            echo "Option -$OPTARG requires an argument." >&2
            exit 1
            ;;
    esac
done

# If output_path is not provided, use default
if [ ! -d "$output_path" ]; then
    # Generate output file
    # If path is a directory, go up one level only
    if [ -d "$input_path" ]; then
        file_parent_dir=$(dirname "$input_path")
    else
        file_parent_dir=$(dirname "$(dirname "$input_path")")        
    fi
    output_path="$file_parent_dir/tool_outputs/graphjs"
    mkdir -p ${output_path}
fi

input_dir=$(dirname "$input_path")
fname=$(basename "$input_path")

# Build docker image if it does not exist
if [ -z "$(docker images -q graphjs)" ]; then
    docker build . -t graphjs
fi

docker run -it \
    -v "${input_dir}":/input \
    -v "${output_path}":/output_path \

