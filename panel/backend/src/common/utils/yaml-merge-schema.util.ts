import { CORE_SCHEMA, mergeTag } from 'js-yaml';

export const YAML_MERGE_SCHEMA = CORE_SCHEMA.withTags(mergeTag);
