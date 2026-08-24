-- Los unique de las tablas de Mercado Libre eran GLOBALES sobre tablas
-- tenant-scoped. Como todas las consultas van con el concesionaria_id inyectado
-- (extensión de Prisma + RLS), una fila de OTRO tenant es invisible pero igual
-- bloquea el INSERT: el upsert no matchea, cae en el create y revienta con un
-- P2002 que el catch por-pregunta se traga. El tenant legítimo se queda sin la
-- pregunta (o sin la publicación) para siempre y sin ningún error visible.
-- Pasan a ser unique POR TENANT.

-- DropIndex
DROP INDEX "preguntas_ml_ml_question_id_key";

-- DropIndex
DROP INDEX "publicaciones_ml_item_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "preguntas_ml_concesionaria_id_ml_question_id_key" ON "preguntas_ml"("concesionaria_id", "ml_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "publicaciones_ml_concesionaria_id_item_id_key" ON "publicaciones_ml"("concesionaria_id", "item_id");
