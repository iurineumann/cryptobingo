import { defineConfig } from "tinacms";

export default defineConfig({
  branch:
    process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || "master",
  clientId:
    process.env.NEXT_PUBLIC_TINA_CLIENT_ID ||
    "fad4e9bf-472d-4ef4-b7ab-e07400e86c76",
  token: process.env.TINA_TOKEN || "b02a801394e9e9a6c6a2dfa904067fd5c86ee83d",

  build: {
    outputFolder: "cms",
    publicFolder: "public",
  },

  media: {
    tina: {
      mediaRoot: "uploads",
      publicFolder: "public",
    },
  },

  schema: {
    collections: [
      {
        name: "page",
        label: "Pages",
        path: "content/pages",
        format: "mdx",
        fields: [
          {
            type: "string",
            name: "title",
            label: "Title",
            isTitle: true,
            required: true,
          },
          {
            type: "rich-text",
            name: "body",
            label: "Content",
            isBody: true,
          },
          {
            type: "string",
            name: "description",
            label: "Description (SEO)",
            ui: { component: "textarea" },
          },
          {
            type: "string",
            name: "slug",
            label: "Slug",
          },
        ],
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
            label: "Title",
            isTitle: true,
            required: true,
          },
          {
            type: "string",
            name: "description",
            label: "Summary",
            ui: { component: "textarea" },
          },
          {
            type: "datetime",
            name: "date",
            label: "Date",
            required: true,
          },
          {
            type: "image",
            name: "cover",
            label: "Cover Image",
          },
          {
            type: "string",
            name: "author",
            label: "Author",
          },
          {
            type: "rich-text",
            name: "body",
            label: "Content",
            isBody: true,
          },
          {
            type: "string",
            name: "tags",
            label: "Tags",
            list: true,
          },
        ],
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
            label: "Question",
            isTitle: true,
            required: true,
          },
          {
            type: "rich-text",
            name: "answer",
            label: "Answer",
            isBody: true,
          },
          {
            type: "number",
            name: "order",
            label: "Order",
          },
          {
            type: "string",
            name: "category",
            label: "Category",
            options: ["general", "gameplay", "tech", "economy"],
          },
        ],
      },
      {
        name: "tutorial",
        label: "Tutorials",
        path: "content/tutorial",
        format: "mdx",
        fields: [
          {
            type: "string",
            name: "title",
            label: "Title",
            isTitle: true,
            required: true,
          },
          {
            type: "string",
            name: "description",
            label: "Description",
            ui: { component: "textarea" },
          },
          {
            type: "rich-text",
            name: "body",
            label: "Content",
            isBody: true,
          },
        ],
      },
      {
        name: "settings",
        label: "Settings",
        path: "content/settings",
        format: "json",
        fields: [
          {
            type: "object",
            name: "hero",
            label: "Hero",
            fields: [
              {
                type: "object",
                name: "title",
                fields: [
                  { type: "string", name: "en", label: "English" },
                  { type: "string", name: "pt", label: "Português" },
                  { type: "string", name: "zh", label: "中文" },
                ],
              },
              {
                type: "object",
                name: "subtitle",
                fields: [
                  { type: "string", name: "en", label: "English", ui: { component: "textarea" } },
                  { type: "string", name: "pt", label: "Português", ui: { component: "textarea" } },
                  { type: "string", name: "zh", label: "中文", ui: { component: "textarea" } },
                ],
              },
              {
                type: "object",
                name: "cta_text",
                fields: [
                  { type: "string", name: "en", label: "English" },
                  { type: "string", name: "pt", label: "Português" },
                  { type: "string", name: "zh", label: "中文" },
                ],
              },
              { type: "string", name: "cta_link", label: "CTA Link" },
            ],
          },
          {
            type: "object",
            name: "features",
            label: "Features",
            list: true,
            fields: [
              {
                type: "object",
                name: "title",
                fields: [
                  { type: "string", name: "en" },
                  { type: "string", name: "pt" },
                  { type: "string", name: "zh" },
                ],
              },
              {
                type: "object",
                name: "description",
                fields: [
                  { type: "string", name: "en", ui: { component: "textarea" } },
                  { type: "string", name: "pt", ui: { component: "textarea" } },
                  { type: "string", name: "zh", ui: { component: "textarea" } },
                ],
              },
              { type: "string", name: "icon" },
            ],
          },
          {
            type: "object",
            name: "social",
            label: "Social",
            fields: [
              { type: "string", name: "telegram" },
              { type: "string", name: "discord" },
              { type: "string", name: "twitter" },
              { type: "string", name: "github" },
            ],
          },
        ],
      },
    ],
  },
  search: {
    tina: {
      indexerToken: "201fce25e220225ab7fc7965aee4eb3ba4206b09",
      stopwordLanguages: ["eng"],
    },
    indexBatchSize: 100,
    maxSearchIndexFieldLength: 100,
  },
});
