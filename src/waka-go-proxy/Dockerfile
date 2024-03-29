FROM golang:1.16-alpine as build
RUN apk update && apk add --no-cache git
WORKDIR /app
COPY src/waka-go-proxy ./
ENV GOPATH /go
ENV GOBIN=$GOPATH/bin
RUN go mod init waka
RUN go get -v ./
RUN go build -o waka-go-proxy

FROM node:14 as docs
WORKDIR /app
COPY . ./
RUN npm install apidoc
RUN npm run document

FROM alpine:3.9
EXPOSE 80
ENV ENDPOINT=https://waka.app/a
ENV PATHPREFIX=/a
WORKDIR /app
RUN apk update && apk add --no-cache ca-certificates
COPY --from=docs /app/dist/docs ./docs
COPY --from=build /app/waka-go-proxy ./
COPY src/cityMetadata.json ./
CMD ./waka-go-proxy -p 80 -f ./cityMetadata.json -docsdir ./docs -e $ENDPOINT -pathprefix $PATHPREFIX
