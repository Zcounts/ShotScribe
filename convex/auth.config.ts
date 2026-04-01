export default {
  providers: [
    {
      domain: process.env.AUTH_ISSUER_URL,
      applicationID: process.env.AUTH_AUDIENCE,
    },
  ],
}
