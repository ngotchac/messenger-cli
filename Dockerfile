FROM mhart/alpine-node

WORKDIR /src
ADD . .

# If you have native dependencies, you'll need extra tools
RUN apk add --update make gcc g++ python git

# If you need npm, don't use a base tag
RUN npm install

EXPOSE 3000
CMD ["node", "index.js"]
