-- Script para limpar todos os dados de usuários
-- Execute este script no Supabase SQL Editor

-- Limpar tabelas relacionadas primeiro (devido às foreign keys)
DELETE FROM two_factor_codes;
DELETE FROM sessions;
DELETE FROM users;

-- Resetar sequências se existirem
-- (Isso garante que os IDs comecem do 1 novamente)
SELECT setval('users_id_seq', 1, false);

-- Verificar se as tabelas estão vazias
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'sessions' as table_name, COUNT(*) as count FROM sessions
UNION ALL
SELECT 'two_factor_codes' as table_name, COUNT(*) as count FROM two_factor_codes;
