'use server'

import { revalidatePath } from 'next/cache'
import { keystoneClient } from '../lib/keystoneClient'
import { getRequestLocale } from '@/features/i18n/server'

async function actionFailure(en: string, pt: string) {
  return await getRequestLocale() === 'pt-BR' ? pt : en
}

// Server actions following Keystone's exact mutation pattern
export async function updateItemAction(listKey: string, id: string, data: Record<string, unknown>) {
  try {
    // Build GraphQL mutation following Keystone's exact pattern
    const mutation = `
      mutation ($id: ID!, $data: ${listKey}UpdateInput!) {
        item: update${listKey}(where: { id: $id }, data: $data) {
          id
        }
      }
    `
    
    const response = await keystoneClient(mutation, { id, data })
    
    if (!response.success) {
      // Return Apollo-style errors array from GraphQL response
      return {
        errors: response.errors || [{ message: response.error || await actionFailure('Update failed', 'Não foi possível atualizar o cadastro.'), path: undefined }],
        data: response.data || null
      }
    }
    
    // Revalidate paths on successful update
    revalidatePath(`/dashboard/(admin)/${listKey}/${id}`)
    revalidatePath(`/dashboard/(admin)/${listKey}`)
    
    // Return Apollo-style response with empty errors array on success
    return { 
      errors: [] as Array<{ message: string; path?: (string | number)[] }>,
      data: response.data
    }
  } catch (error) {
    // Return error in Apollo format
    return {
      errors: [{ message: await actionFailure('Update failed', 'Não foi possível atualizar o cadastro.'), path: undefined }],
      data: null
    }
  }
}

export async function createItemAction(listKey: string, data: Record<string, unknown>, selectedFields: string = 'id', options?: { skipRevalidation?: boolean }) {
  try {
    // Build GraphQL mutation following Keystone's exact pattern
    const mutation = `
      mutation ($data: ${listKey}CreateInput!) {
        item: create${listKey}(data: $data) {
          ${selectedFields}
        }
      }
    `
    
    const response = await keystoneClient(mutation, { data })
    
    if (!response.success) {
      // Return Apollo-style errors array from GraphQL response
      return {
        errors: response.errors || [{ message: response.error || await actionFailure('Create failed', 'Não foi possível criar o cadastro.'), path: undefined }],
        data: null
      }
    }
    
    // Revalidate paths on successful create (unless skipped for drawer context)
    if (!options?.skipRevalidation) {
      revalidatePath(`/dashboard/(admin)/${listKey}`)
    }
    
    // Return Apollo-style response with empty errors array on success
    return { 
      errors: [] as Array<{ message: string; path?: (string | number)[] }>,
      data: response.data
    }
  } catch (error) {
    // Return error in Apollo format
    return {
      errors: [{ message: await actionFailure('Create failed', 'Não foi possível criar o cadastro.'), path: undefined }],
      data: null
    }
  }
}

export async function deleteItemAction(listKey: string, id: string) {
  try {
    // Build GraphQL mutation following Keystone's exact pattern
    const mutation = `
      mutation ($id: ID!) {
        delete${listKey}(where: { id: $id }) {
          id
        }
      }
    `
    
    const response = await keystoneClient(mutation, { id })
    
    if (!response.success) {
      // Return Apollo-style errors array from GraphQL response
      return {
        errors: response.errors || [{ message: response.error || await actionFailure('Delete failed', 'Não foi possível excluir o cadastro.'), path: undefined }],
        data: null
      }
    }
    
    // Revalidate paths on successful delete
    revalidatePath(`/dashboard/(admin)/${listKey}`)
    
    // Return Apollo-style response with empty errors array on success
    return {
      errors: [] as Array<{ message: string; path?: (string | number)[] }>,
      data: response.data
    }
  } catch (error) {
    // Return error in Apollo format
    return {
      errors: [{ message: await actionFailure('Delete failed', 'Não foi possível excluir o cadastro.'), path: undefined }],
      data: null
    }
  }
}

export async function deleteManyItemsAction(
  listKey: string, 
  ids: string[], 
  gqlNames: { deleteManyMutationName: string; whereUniqueInputName: string }
) {
  try {
    // Build GraphQL mutation using the provided gqlNames
    const mutation = `
      mutation ($where: [${gqlNames.whereUniqueInputName}!]!) {
        items: ${gqlNames.deleteManyMutationName}(where: $where) {
          id
        }
      }
    `
    
    const response = await keystoneClient(mutation, {
      where: ids.map((id) => ({ id }))
    })
    
    if (!response.success) {
      // Return Apollo-style errors array from GraphQL response
      return {
        errors: response.errors || [{ message: response.error || await actionFailure('Bulk delete failed', 'Não foi possível excluir os cadastros.'), path: undefined }],
        data: null
      }
    }
    
    // Revalidate paths on successful delete
    revalidatePath(`/dashboard/(admin)/${listKey}`)
    
    // Return Apollo-style response with empty errors array on success
    return {
      errors: [] as Array<{ message: string; path?: (string | number)[] }>,
      data: response.data
    }
  } catch (error) {
    // Return error in Apollo format
    return {
      errors: [{ message: await actionFailure('Bulk delete failed', 'Não foi possível excluir os cadastros.'), path: undefined }],
      data: null
    }
  }
}
