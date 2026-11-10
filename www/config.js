// Configuração pública do Hub. A chave "publishable" foi feita para ficar no navegador:
// os dados são protegidos pelas regras de acesso (RLS) do banco e pelo login.
window.HUB_CONFIG = {
  supabaseUrl: "https://gybdgrfklukgrsfomrey.supabase.co",
  supabaseKey: "sb_publishable_gNqnWw9w3gPL9ZaUQJiSvA_DqgjmDak",
  sistemas: {
    helpdesk: "https://chamados.grupozerbini.com.br",
    ativos: "https://ativos.grupozerbini.com.br",
    compras: "https://compras.grupozerbini.com.br"
  }
};
