const envConfig = {
  APP_NAME: "Melosys Lokalt",
  API_BASE_URL: "/api/",
  TRYGDEAVTALE_FLYT_BASE_URL: "/trygdeavtale-flyt/",
  FAKTURERINGSKOMPONENTEN_FLYT_BASE_URL: "/faktureringskomponenten/",
  GRAPHQL_URL: "/graphql/",
  LOCAL_CONTEXT: "/melosys",
  LOCAL_API_PORT: "8080",
  AZURE_APP_TENANT_ID: "966ac572-f5b7-4bbe-aa88-c76419c0f851",
  AZURE_CLIENT_ID: "44d6bc90-5754-4ba7-a56c-005f122cdc96",
  AZURE_CLIENT_NAME: "melosys-web",
  CLUSTER: "dev-fss",
  FAKTURERINGSKOMPONENTEN_CLUSTER: "dev-gcp",
  FAKTURERINGSKOMPONENTEN_APP_NAME: "faktureringskomponenten",
  TRYGDEAVTALE_APP_NAME: "melosys-trygdeavtale-q1",
  MELOSYS_API_APP_NAME: "melosys-q1",
  ENVIRONMENT: "local",
  LOCAL_AUTH_TOKEN: "eyJhbGciOiJSUzI1NiIsImtpZCI6Imlzc28iLCJ0eXAiOiJKV1QifQ.eyJzdWIiOiJaMTIzNDU2IiwiTkFWaWRlbnQiOiJaMTIzNDU2IiwiaXNzIjoiaHR0cDovL2hvc3QuZG9ja2VyLmludGVybmFsOjgwODIvaXNzbyIsImdyb3VwcyI6WyIwMDAwLUdBLU1FTE9TWVMiXSwibm9uY2UiOiJhYmMxMjMiLCJhdWQiOiJtZWxvc3lzLWxvY2FsaG9zdCIsIm5iZiI6MTc3NTc1MTYxMywiYXpwIjoibWVsb3N5cy1sb2NhbGhvc3QiLCJuYW1lIjoiTG9rYWwgVGVzdGJydWtlciIsImV4cCI6MTk2NDk2NzYxMywiaWF0IjoxNzc1NzUxNjEzfQ.KcnXsmydJ_RINiubpIZXtIpfHf7kRRDROvYnpChGh8KFmzrf1xptlhF1n1nXv5trvH1_yrItMATVmb8eu73DwuWNNx4nkjzKlz6EPIF9qxDkSHmruHW3fgAHTEP8kgIYVVqZXRPtqDv4aWsVjU1COm12blH24HFyNisNEULGuAtYQDJ5mOoYuv6x8BWK6QcADDjPP8UeGswZBQdfAM2cirWT1yo0HacfEK4TrsRTnSSdmREL9GzjVaoxg8Rb8B5EDIbuxyr-NPeGUNGtpOhaSBC5l_2UnEehKqjt4kdkmWF1CIieTvncjh9ActNvCrOrsGhU9y8T9PRCl-vbBAYwcQ"
};

window.env = envConfig;
export default envConfig;
