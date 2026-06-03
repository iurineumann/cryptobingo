describe('dropController', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        process.env = { ...OLD_ENV, MICROSERVICE_PRIVATE_KEY: 'x', CHAIN_ID: 'y', RPC_URL: 'http://localhost:8888' };
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('deve importar sem erros', () => {
        expect(() => require('./dropController')).not.toThrow();
    });
});
