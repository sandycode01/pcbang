# 1. Start from an official base image
FROM node:20-alpine

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy dependency files first (enables layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# 5. Copy the rest of your project files
COPY . .

# 6. Document the port your app uses
EXPOSE 3000

# 7. Command to start the app
CMD ["npm", "start"]
