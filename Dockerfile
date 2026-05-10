FROM ghcr.io/puppeteer/puppeteer:latest

# Switch to root to copy files and adjust permissions
USER root

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy all project files
COPY . .

# Change ownership of the app directory to the pptruser
RUN chown -R pptruser:pptruser /usr/src/app

# Switch back to the non-root user for security
USER pptruser

EXPOSE 3000

CMD ["node", "index.js"]
