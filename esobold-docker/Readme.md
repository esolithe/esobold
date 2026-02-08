### What is this
- Images can be found [here](https://hub.docker.com/repository/docker/esolithe/esobold/)
- This folder contains a docker compose config which should quite happily run on most nvidia systems, creating volumes as needed.
- To install, download this directory and with docker installed run:
```sh
docker compose up
```
- To stop the container use:
```sh
docker compose down
```
### For devs
- To build use:
```sh
docker build -t esolithe/esobold:latest .
```
- To push to dockerhub use:
```sh
docker push esolithe/esobold:latest 
```