###########################################################
# Building and Run stage
###########################################################
FROM node:20-slim
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "src/index.js"]

###########################################################
# Build and run example: 
#
# sudo docker build -t jackett-plugin:debug . && sudo docker run -it --init --rm -p 7001:7001 --env-file .env jackett-plugin:debug
#
