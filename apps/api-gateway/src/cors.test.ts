import { getAllowedOrigins, createCorsOptions } from "./cors";

describe("CORS configuration", () => {
  it("inclui o domínio customizado do frontend e da API por padrão", () => {
    const origins = getAllowedOrigins();

    expect(origins).toEqual(
      expect.arrayContaining([
        "https://test.cryptobingo.bet",
        "https://test-api.cryptobingo.bet",
      ]),
    );
  });

  it("aceita a origem do frontend customizado em preflight", () => {
    const options = createCorsOptions(getAllowedOrigins());
    const callback = jest.fn();

    options.origin?.("https://test.cryptobingo.bet", callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it("aceita a origem da API customizada em preflight", () => {
    const options = createCorsOptions(getAllowedOrigins());
    const callback = jest.fn();

    options.origin?.("https://test-api.cryptobingo.bet", callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });
});
