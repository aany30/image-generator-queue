# Image Prompt Automator

A small static frontend plus Vercel serverless API for applying one prompt to a batch of up to 10 uploaded images.

## How the queue works

The browser owns the queue. You enter the prompt once, upload up to 10 images, and click **Start queue**. The frontend then calls `/api/generate` once per image, always sending the same prompt with the current image.

This keeps the app deployable on Vercel because each image generation is an independent serverless request. If one image fails, the failed item can be retried without restarting the full batch.

## Local development

1. Copy `.env.example` to `.env`.
2. Set `OPENAI_API_KEY`.
3. Run:

```sh
npm run dev
```

The app will run at `http://localhost:4173`.

## Deploying to Vercel

1. Import this repository in Vercel.
2. Add `OPENAI_API_KEY` in the Vercel project environment variables.
3. Deploy.

Vercel serves files from `public/` and runs the API handlers in `api/`.
