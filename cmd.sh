docker build -t test image
docker run \
  -it --rm \
  -p 30000:4000 \
  -v $PWD/src/main.py \
  test
