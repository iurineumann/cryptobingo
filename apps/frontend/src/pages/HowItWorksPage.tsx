import Seo from '../components/Seo';
import ContentPage from '../components/content/ContentPage';

export default function HowItWorksPage() {
  return (
    <>
      <Seo
        title="Como Funciona"
        description="CryptoBingo é Bingo on-chain na blockchain WAX. Sorteios verificáveis, pagamento automático por smart contract e prêmios justos."
        canonical="/how-it-works"
      />
      <ContentPage type="howitworks" testId="how-it-works" titleKey="nav.how_it_works" />
    </>
  );
}
