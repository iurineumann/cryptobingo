import { createClient } from "tinacms/dist/client";
import { queries } from "./types.js";
export const client = createClient({ url: 'http://localhost:4001/graphql', token: 'b02a801394e9e9a6c6a2dfa904067fd5c86ee83d', queries,  });
export default client;
  