// Dependabot security fixes via pnpm hooks
// qs: GHSA-q8mj-m7cp-5q26 — @cypress/request pede ~6.14.1 (vulnerável); força >=6.15.2
// uuid: GHSA-w5hq-g745-h8pq — transitivos do Cypress/@aws-amplify; força >=11.1.1
function readPackage(pkg, context) {
    if (pkg.dependencies?.qs) {
        pkg.dependencies.qs = '>=6.15.2';
    }
    if (pkg.devDependencies?.qs) {
        pkg.devDependencies.qs = '>=6.15.2';
    }
    if (pkg.dependencies?.uuid) {
        pkg.dependencies.uuid = '>=11.1.1';
    }
    if (pkg.devDependencies?.uuid) {
        pkg.devDependencies.uuid = '>=11.1.1';
    }
    return pkg;
}

module.exports = { hooks: { readPackage } };
