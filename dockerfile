# syntax=docker/dockerfile:1

# Comments are provided throughout this file to help you get started.
# If you need more help, visit the Dockerfile reference guide at
# https://docs.docker.com/go/dockerfile-reference/

# Want to help us make this template better? Share your feedback here: https://forms.gle/ybq9Krt8jtBL3iCk7

ARG NODE_VERSION=18.17.0

FROM node:${NODE_VERSION}-alpine

# Use production node environment by default.
ENV NODE_ENV production
ENV MONGODB_URI mongodb+srv://connectsiddha_staging:TZcQRUKjTY5U99zR@cluster0.5qw8rhx.mongodb.net/?retryWrites=true&w=majority
ENV GOOGLE_OAUTH2_CLIENT_ID 210196238889-lu2094murihq4drd4s0eccpli2ug69tf.apps.googleusercontent.com
ENV GOOGLE_OAUTH2_CLIENT_SECRET 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
ENV GOOGLE_OAUTH2_REDIRECT_URI http://localhost:8010/auth/google/callback
ENV GOOGLE_OAUTH2_API_KEY AIzaSyCPsYZICmKvmd8nrrCVkaAO9AQ1-1Nes-k
ENV JWT_SECRET sgafiem73ndpb6eopcdhdfghdfghfgh348334943034598
ENV FRONTEND_URL http://localhost:3000
ENV BACKEND_URL http://localhost:8010
ENV TELESIGN_CUSTOMER_ID 5DE1ADDE-3CC2-451C-8170-69AC1F51277B
ENV TELESIGN_API_KEY 3bJ7KRinEUFnN98fXZeqY2HFz+L3ijl/0fLoSp2exKCXDA7p9AM75o5fG+k9Qj//CxJ+J639hHRJYwAtDpcB/A==
ENV TELESIGN_PHONE_NUMBER 917611821710

WORKDIR /usr/app

# Download dependencies as a separate step to take advantage of Docker's caching.
# Leverage a cache mount to /root/.npm to speed up subsequent builds.
# Leverage a bind mounts to package.json and package-lock.json to avoid having to copy them into
# into this layer.
RUN --mount=type=bind,source=package.json,target=package.json \
  --mount=type=bind,source=package-lock.json,target=package-lock.json \
  --mount=type=cache,target=/root/.npm \
  npm ci --omit=dev

# Run the application as a non-root user.
USER node

# Copy the rest of the source files into the image.
COPY . .

# Expose the port that the application listens on.
EXPOSE 8010

# Run the application.
CMD node server.js
