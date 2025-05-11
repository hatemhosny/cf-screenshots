export const onRequest = () =>
  new Response("Hello World!", {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      "Access-Control-Allow-Origin": "*",
    },
  });
