# Bot Discord + Hotmart Subscription

Bot para gerenciar assinaturas Hotmart e roles no Discord.

## Configuração

1. Copie `.env.example` para `.env` e preencha as variáveis.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Inicie o bot:
   ```bash
   npm start
   ```

## Estrutura

- `src/bot/` - Lógica do Discord
- `src/webhook/` - Webhook Hotmart
- `src/db/` - Banco de dados
- `src/utils/` - Utilitários
