# JWT Test Scripts

Scripts para testar a validação de JWT tokens para microsserviços.

## Instalação

```bash
pip install PyJWT
# ou
pip install -r scripts/requirements-test.txt
```

## Teste Rápido (Token Gerado)

Testa geração e validação de token:

```bash
python3 scripts/test-jwt-full.py --generate
```

## Teste com Token Real

### 1. Obter token da API

Primeiro, você precisa estar autenticado no Next.js app. Então faça uma requisição:

```bash
# No browser console ou usando curl:
curl -X POST http://localhost:3000/api/microservices/token \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

Ou usando o browser:

1. Abra o DevTools (F12)
2. Vá para a aba Console
3. Execute:
```javascript
const response = await fetch('/api/microservices/token', {
  method: 'POST',
  credentials: 'include'
});
const { accessToken } = await response.json();
console.log('Token:', accessToken);
```

### 2. Validar token

```bash
# Configure o JWT_SECRET (deve ser o mesmo do .env.local)
export JWT_SECRET="your-jwt-secret-from-env-local"

# Teste o token
python3 scripts/test-jwt-full.py "YOUR_TOKEN_HERE"
```

## Exemplo de Saída

```
======================================================================
JWT Validation Test - Complete Flow
======================================================================

Configuration:
  JWT_SECRET: ********************...abc12345
  JWT_ISSUER: iris
  JWT_AUDIENCE: microservices

Validating token...
----------------------------------------------------------------------
✅ Token is valid!

Token Payload:
{
  "userId": "uuid-here",
  "email": "user@example.com",
  "organizationId": "org-uuid",
  "organizationSlug": "my-org",
  "role": "owner",
  "permissions": [...]
}

✅ Hello World - JWT validation working correctly!
```

## Troubleshooting

- **Token expired**: Token expira em 1 hora. Obtenha um novo token.
- **Invalid secret**: Certifique-se que JWT_SECRET está configurado corretamente.
- **Invalid issuer/audience**: Verifique se JWT_ISSUER e JWT_AUDIENCE estão corretos.

