import {
    School,
    SchoolCreate,
    SchoolUpdate,
    createSchoolEndpointV1SchoolsCreatePost,
    deleteSchoolLogoV1SchoolsLogoDelete,
    getAllSchoolsEndpointV1SchoolsAllGet,
    getSchoolEndpointV1SchoolsGet,
    getSchoolLogoEndpointV1SchoolsLogoGet,
    getSchoolsQuantityEndpointV1SchoolsQuantityGet,
    patchSchoolLogoV1SchoolsLogoPatch,
    updateSchoolEndpointV1SchoolsPatch,
} from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { GetAccessTokenHeader } from "@/lib/utils/token";

export async function GetAllSchools(offset: number, limit: number): Promise<School[]> {
    const result = await getAllSchoolsEndpointV1SchoolsAllGet({
        headers: { Authorization: GetAccessTokenHeader() },
        query: { offset: offset, limit: limit, show_all: true },
    });

    if (result.error) {
        const errorMessage = `Failed to get all schools: ${result.response.status} ${result.response.statusText}`;
        customLogger.error(errorMessage);
        throw new Error(errorMessage);
    }

    return result.data;
}

export async function GetSchoolLogo(fn: string): Promise<Blob> {
    const result = await getSchoolLogoEndpointV1SchoolsLogoGet({
        headers: { Authorization: GetAccessTokenHeader() },
        query: { fn },
    });

    if (result.error) {
        const errorMessage = `Failed to get school logo: ${result.response.status} ${result.response.statusText}`;
        customLogger.error(errorMessage);
        throw new Error(errorMessage);
    }

    // Type assertion needed as the generated type is not specific about Blob
    const logoBlob = result.data as unknown as Blob;
    customLogger.debug("School logo response blob size:", logoBlob.size);
    return logoBlob;
}

export async function UpdateSchoolInfo(school: SchoolUpdate): Promise<School> {
    const result = await updateSchoolEndpointV1SchoolsPatch({
        headers: { Authorization: GetAccessTokenHeader() },
        body: school,
    });

    if (result.error) {
        const errorMessage = `Failed to update school info: ${result.response.status} ${result.response.statusText}`;
        customLogger.error(errorMessage);
        throw new Error(errorMessage);
    }

    return result.data;
}

export async function UploadSchoolLogo(schoolId: number, file: File): Promise<School> {
    const formData = new FormData();
    formData.append("img", file);

    const result = await patchSchoolLogoV1SchoolsLogoPatch({
        headers: { Authorization: GetAccessTokenHeader() },
        query: { school_id: schoolId },
        body: { img: file },
    });

    if (result.error) {
        const errorMessage = `Failed to upload school logo: ${result.response.status} ${result.response.statusText}`;
        customLogger.error(errorMessage);
        throw new Error(errorMessage);
    }

    return result.data;
}

export async function RemoveSchoolLogo(schoolId: number): Promise<School> {
    const result = await deleteSchoolLogoV1SchoolsLogoDelete({
        headers: { Authorization: GetAccessTokenHeader() },
        query: { school_id: schoolId },
    });

    if (result.error) {
        const errorMessage = `Failed to remove school logo: ${result.response.status} ${result.response.statusText}`;
        customLogger.error(errorMessage);
        throw new Error(errorMessage);
    }

    return result.data;
}

export async function GetSchoolQuantity(): Promise<number> {
    const result = await getSchoolsQuantityEndpointV1SchoolsQuantityGet({
        headers: { Authorization: GetAccessTokenHeader() },
    });

    if (result.error) {
        const errorMessage = `Failed to get school quantity: ${result.response.status} ${result.response.statusText}`;
        customLogger.error(errorMessage);
        throw new Error(errorMessage);
    }

    return result.data ?? 0;
}

export async function CreateSchool(school: SchoolCreate): Promise<School> {
    const result = await createSchoolEndpointV1SchoolsCreatePost({
        headers: { Authorization: GetAccessTokenHeader() },
        body: school,
    });

    if (result.error) {
        const errorMessage = `Failed to create school: ${result.response.status} ${result.response.statusText}`;
        customLogger.error(errorMessage);
        throw new Error(errorMessage);
    }

    return result.data;
}

export async function GetSchoolInfo(schoolId: number): Promise<School> {
    const result = await getSchoolEndpointV1SchoolsGet({
        headers: { Authorization: GetAccessTokenHeader() },
        query: { school_id: schoolId },
    });

    if (result.error) {
        const errorMessage = `Failed to get school info: ${result.response.status} ${result.response.statusText}`;
        customLogger.error(errorMessage);
        throw new Error(errorMessage);
    }

    return result.data;
}
