import type { IDataObject, ILoadOptionsFunctions, ResourceMapperFields } from 'n8n-workflow';

import { buildTemplateVariableFields, extractTemplateId } from '../helpers/template';
import { json2VideoApiRequest } from '../transport';

/**
 * Notices shown in place of the field list when there is nothing to map. n8n
 * renders `emptyFieldsNotice` as an info panel, and the property sets
 * `hideNoDataError: true` so this replaces the generic "no variables found"
 * warning — telling the user *which* of the three cases they are in is the
 * whole point.
 */
const NO_TEMPLATE_NOTICE =
	'Select a template above and its variables appear here, one input per variable.';

const NO_VARIABLES_NOTICE =
	'This template declares no variables, so there is nothing to fill in — render it as it is. Add {{placeholders}} to the template to get inputs here.';

const LOAD_FAILED_NOTICE =
	'The template variables could not be loaded. Check that the template still exists and that the API key is valid, then refresh the variable list. You can also switch Specify Variables to Using JSON and set the values by hand.';

/**
 * Variables of the template currently selected in the `templateId` resource
 * locator, as `resourceMapper` fields — the Variables section of Movie → Create
 * and Movie → Render and Wait (Appendix C).
 *
 * The field list is refetched whenever the selected template changes:
 * `typeOptions.loadOptionsDependsOn: ['templateId.value']` on the parameter is
 * what n8n's ResourceMapper watches, exactly as a plain `options` dropdown does.
 * A resource locator's dependency is its inner `.value`, not the locator object,
 * and inside this handler `getCurrentNodeParameter('templateId')` returns the
 * whole `{ mode, value }` object — hence `extractTemplateId`.
 *
 * `format=make` is the only shape that returns typed variable descriptors
 * (name, label, type, default, help, select options, nested `spec`); the
 * default and `format=jsonschema` shapes do not. It is an internal format —
 * see `operations.md` → "Template — Get" and Appendix A.4.
 *
 * Degrades gracefully: no template selected yet, an expired key, a key whose
 * role is too low, a withdrawn `format=make` or any other failure returns an
 * empty field list with an explanatory notice instead of breaking the parameter
 * panel. The raw-JSON variables mode always remains available.
 */
export async function getTemplateVariableFields(
	this: ILoadOptionsFunctions,
): Promise<ResourceMapperFields> {
	try {
		const templateId = extractTemplateId(this.getCurrentNodeParameter('templateId'));
		if (templateId === '') return { fields: [], emptyFieldsNotice: NO_TEMPLATE_NOTICE };

		const response = await json2VideoApiRequest.call(this, 'GET', '/templates', {
			qs: { id: templateId, format: 'make' },
		});

		const template =
			typeof response.template === 'object' && response.template !== null
				? (response.template as IDataObject)
				: {};

		const fields = buildTemplateVariableFields(template.variables);
		if (fields.length === 0) return { fields: [], emptyFieldsNotice: NO_VARIABLES_NOTICE };

		return { fields };
	} catch {
		return { fields: [], emptyFieldsNotice: LOAD_FAILED_NOTICE };
	}
}
