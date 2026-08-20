// @ts-check
import tseslint from 'typescript-eslint';
import rootConfig from '../../eslint.config.js';

export default tseslint.config(...rootConfig, {
  languageOptions: {
    parserOptions: {
      projectService: false,
      project: './tsconfig.typecheck.json',
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
