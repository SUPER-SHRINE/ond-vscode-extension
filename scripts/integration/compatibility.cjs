// 呼出元でprovenanceを検証したLanguage Serverの版に対して適用する。
exports.supportsCompatibility = version => {
  const [major, minor] = version.split('.').map(Number);
  return major > 0 || minor >= 4;
};
exports.COMPATIBILITY_TESTS = ['ond_040_compatibility','asm_header_uses_ond_completion','completion_qualified_import','definition_qualified_imports','unqualified_internal_import_rejected','unqualified_internal_import_cleared','obsolete_interface_declaration_rejected','obsolete_interface_declaration_cleared','completion_all_source_files_visible','completion_test_named_source','role_context_completions'];
