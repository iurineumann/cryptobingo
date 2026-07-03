// tina/config.ts
import { defineConfig } from "tinacms";
var config_default = defineConfig({
  branch: process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || "feature/growth-stack",
  clientId: process.env.NEXT_PUBLIC_TINA_CLIENT_ID || "fad4e9bf-472d-4ef4-b7ab-e07400e86c76",
  token: process.env.TINA_TOKEN || "90fd06780913f3f08896304673279852152ff9d1",
  build: {
    outputFolder: "cms",
    publicFolder: "public"
  },
  media: {
    tina: {
      mediaRoot: "uploads",
      publicFolder: "public"
    }
  },
  schema: {
    collections: [
      {
        name: "page",
        label: "P\xE1ginas",
        path: "content/pages",
        format: "mdx",
        fields: [
          {
            type: "string",
            name: "title",
            label: "T\xEDtulo",
            isTitle: true,
            required: true
          },
          {
            type: "rich-text",
            name: "body",
            label: "Conte\xFAdo",
            isBody: true
          },
          {
            type: "string",
            name: "description",
            label: "Descri\xE7\xE3o (SEO)",
            ui: { component: "textarea" }
          },
          {
            type: "string",
            name: "slug",
            label: "Slug"
          }
        ]
      },
      {
        name: "blog",
        label: "Blog",
        path: "content/blog",
        format: "mdx",
        fields: [
          {
            type: "string",
            name: "title",
            label: "T\xEDtulo",
            isTitle: true,
            required: true
          },
          {
            type: "string",
            name: "description",
            label: "Resumo",
            ui: { component: "textarea" }
          },
          {
            type: "datetime",
            name: "date",
            label: "Data",
            required: true
          },
          {
            type: "image",
            name: "cover",
            label: "Imagem de capa"
          },
          {
            type: "string",
            name: "author",
            label: "Autor"
          },
          {
            type: "rich-text",
            name: "body",
            label: "Conte\xFAdo",
            isBody: true
          },
          {
            type: "string",
            name: "tags",
            label: "Tags",
            list: true
          }
        ]
      },
      {
        name: "faq",
        label: "FAQ",
        path: "content/faq",
        format: "md",
        fields: [
          {
            type: "string",
            name: "question",
            label: "Pergunta",
            isTitle: true,
            required: true
          },
          {
            type: "rich-text",
            name: "answer",
            label: "Resposta",
            isBody: true
          },
          {
            type: "number",
            name: "order",
            label: "Ordem"
          },
          {
            type: "string",
            name: "category",
            label: "Categoria",
            options: ["general", "gameplay", "tech", "economy"]
          }
        ]
      },
      {
        name: "settings",
        label: "Configura\xE7\xF5es",
        path: "content/settings",
        format: "json",
        fields: [
          {
            type: "object",
            name: "hero",
            label: "Hero",
            fields: [
              { type: "string", name: "title" },
              { type: "string", name: "subtitle", ui: { component: "textarea" } },
              { type: "string", name: "cta_text", label: "Bot\xE3o CTA" },
              { type: "string", name: "cta_link", label: "Link CTA" }
            ]
          },
          {
            type: "object",
            name: "features",
            label: "Features",
            list: true,
            fields: [
              { type: "string", name: "title" },
              { type: "string", name: "description", ui: { component: "textarea" } },
              { type: "string", name: "icon" }
            ]
          },
          {
            type: "object",
            name: "social",
            label: "Redes Sociais",
            fields: [
              { type: "string", name: "telegram" },
              { type: "string", name: "discord" },
              { type: "string", name: "twitter" },
              { type: "string", name: "github" }
            ]
          }
        ]
      }
    ]
  }
});
export {
  config_default as default
};
