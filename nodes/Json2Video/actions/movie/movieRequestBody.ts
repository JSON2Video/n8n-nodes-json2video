import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	applyMovieOptions,
	keyValuePairsToObject,
	parseJsonObjectParameter,
} from '../../helpers/movie';

/**
 * Builds the `POST /v2/movies` request body from the node parameters. Shared by
 * Create and Render and Wait, which expose exactly the same form.
 *
 * All validation errors are `NodeOperationError`s thrown before any HTTP call,
 * so a malformed document never costs the user a request.
 */
export function buildMovieRequestBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const inputMode = this.getNodeParameter('inputMode', itemIndex) as string;

	let base: IDataObject;

	if (inputMode === 'json') {
		const movieJson = this.getNodeParameter('movieJson', itemIndex);
		try {
			base = parseJsonObjectParameter(movieJson, 'Movie JSON');
		} catch (error) {
			throw new NodeOperationError(this.getNode(), (error as Error).message, {
				itemIndex,
				description:
					'Fix the Movie JSON field. See the Movie JSON reference at https://json2video.com/docs/v2/.',
			});
		}
	} else {
		const templateId = this.getNodeParameter('templateId', itemIndex, undefined, {
			extractValue: true,
		}) as string;

		if (typeof templateId !== 'string' || templateId.trim() === '') {
			throw new NodeOperationError(this.getNode(), 'No template selected', {
				itemIndex,
				description:
					'Choose a template from the list or provide its ID. The ID is the 20-character string returned when the template was created.',
			});
		}

		const specifyVariables = this.getNodeParameter(
			'specifyVariables',
			itemIndex,
			'keypair',
		) as string;

		let variables: IDataObject;
		if (specifyVariables === 'json') {
			const variablesJson = this.getNodeParameter('variablesJson', itemIndex, '{}');
			try {
				variables = parseJsonObjectParameter(variablesJson, 'Variables (JSON)');
			} catch (error) {
				throw new NodeOperationError(this.getNode(), (error as Error).message, { itemIndex });
			}
		} else {
			variables = keyValuePairsToObject(
				this.getNodeParameter('variablesUi', itemIndex, {}),
				'variable',
			);
		}

		base = { template: templateId.trim() };
		if (Object.keys(variables).length > 0) base.variables = variables;
	}

	const additionalOptions = this.getNodeParameter('additionalOptions', itemIndex, {}) as IDataObject;

	try {
		return applyMovieOptions(base, additionalOptions);
	} catch (error) {
		throw new NodeOperationError(this.getNode(), (error as Error).message, { itemIndex });
	}
}
