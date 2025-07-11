<!-- markdownlint-disable MD033 MD041 -->

<div align="center">
    <a href="https://github.com/Bento-Project-SCARS/ProjectSCARS">
        <img src="https://raw.githubusercontent.com/Bento-Project-SCARS/ProjectSCARS/3686d8959946b31114ca8e45afde372896ad672f/WebClient/public/assets/logos/BENTO.svg" alt="Bento Logo" width="15%" height="auto" />
    </a>
    <h1>
        Bento
        <a href="https://github.com/Bento-Project-SCARS/ProjectSCARS/tags">
            <img src="https://img.shields.io/github/v/tag/Bento-Project-SCARS/ProjectSCARS?sort=semver&filter=v*&style=flat&label=&color=0a0a0a" alt="Latest Version" />
        </a>
    </h1>
    <a href="https://github.com/Bento-Project-SCARS/ProjectSCARS/commits"><img src="https://img.shields.io/github/last-commit/Bento-Project-SCARS/ProjectSCARS?label=Last%20Commit&style=flat" alt="GitHub Last Commit" /></a>
    <a href="https://github.com/Bento-Project-SCARS/ProjectSCARS/issues"><img src="https://img.shields.io/github/issues/Bento-Project-SCARS/ProjectSCARS?label=Issues&style=flat" alt="GitHub Issues or Pull Requests" /></a>
    <a href="https://github.com/Bento-Project-SCARS/ProjectSCARS/actions/workflows/lint.yml"><img src="https://img.shields.io/github/actions/workflow/status/Bento-Project-SCARS/ProjectSCARS/lint.yml?flat&label=Codebase%20Style" alt="Linter Results" /></a>
    <a href="https://codecov.io/gh/Bento-Project-SCARS/ProjectSCARS"><img src="https://img.shields.io/codecov/c/github/Bento-Project-SCARS/ProjectSCARS?token=BJWS49M1DI&style=flat&label=Code%20Coverage" alt="Code Coverage" /></a>
    <a href="https://github.com/Bento-Project-SCARS/ProjectSCARS"><img src="https://img.shields.io/github/languages/code-size/Bento-Project-SCARS/ProjectSCARS?label=Repo%20Size&style=flat" alt="GitHub Repository Size" /></a>
    <a href="https://github.com/Bento-Project-SCARS/ProjectSCARS/milestone/2"><img src="https://img.shields.io/github/milestones/progress-percent/Bento-Project-SCARS/ProjectSCARS/2?style=flat&label=Completed&color=orange" alt="Project Milestone Progress" /></a>
</div>

**Bento** is a School Canteen Automated Reporting System for the Department
of Education (DepEd) Schools Division Office (SDO) of the City of Baliwag in
the Philippines.

> _Why Bento?_
>
> BENTO stands for **B**aliuag's **E**nhanced **N**etwork for School Canteen **T**racking **O**perations.
>
> > "A bento is a Japanese-style single-portion take-out or home-packed meal,
> > often for lunch, typically including rice and packaged in a box with a lid.
> > The term bento is derived from the Chinese term biandang, which means
> > "convenient" or "convenience"."
> >
> > \- [Wikipedia](https://en.wikipedia.org/wiki/Bento)

| Component      | Open Issues                                                                                                                                                                                                                                                                                                                                | Last Commit                                                                                                                                                                                                                                      | Test Results                                                                                                                                                                                                                                                 | Code Coverage                                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Central Server | [![GitHub Issues or Pull Requests by label](https://img.shields.io/github/issues-raw/Bento-Project-SCARS/ProjectSCARS/scope%20%3E%20central%20server?style=for-the-badge&label=&color=%2300000000)](https://github.com/Bento-Project-SCARS/ProjectSCARS/issues?q=is%3Aissue%20state%3Aopen%20label%3A%22scope%20%3E%20central%20server%22) | [![GitHub last commit](https://img.shields.io/github/last-commit/Bento-Project-SCARS/ProjectSCARS?path=CentralServer&style=for-the-badge&label=&color=%2300000000)](https://github.com/Bento-Project-SCARS/ProjectSCARS/tree/main/CentralServer) | [![Central Server Tests](https://img.shields.io/github/actions/workflow/status/Bento-Project-SCARS/ProjectSCARS/central-server-tests.yml?style=flat&label=)](https://github.com/Bento-Project-SCARS/ProjectSCARS/actions/workflows/central-server-tests.yml) | [![Central Server Code Coverage](https://img.shields.io/codecov/c/github/Bento-Project-SCARS/ProjectSCARS?token=BJWS49M1DI&flag=central-server&label=&style=flat)](https://app.codecov.io/gh/Bento-Project-SCARS/ProjectSCARS/flags) |
| Web Client     | [![GitHub Issues or Pull Requests by label](https://img.shields.io/github/issues-raw/Bento-Project-SCARS/ProjectSCARS/scope%20%3E%20web%20client?style=for-the-badge&label=&color=%2300000000)](https://github.com/Bento-Project-SCARS/ProjectSCARS/issues?q=is%3Aissue%20state%3Aopen%20label%3A%22scope%20%3E%20web%20client%22)         | [![GitHub last commit](https://img.shields.io/github/last-commit/Bento-Project-SCARS/ProjectSCARS?path=WebClient&style=for-the-badge&label=&color=%2300000000)](https://github.com/Bento-Project-SCARS/ProjectSCARS/tree/main/WebClient)         | [![Web Client Tests](https://img.shields.io/github/actions/workflow/status/Bento-Project-SCARS/ProjectSCARS/web-client-tests.yml?style=flat&label=)](https://github.com/Bento-Project-SCARS/ProjectSCARS/actions/workflows/web-client-tests.yml)             | [![Web Client Code Coverage](https://img.shields.io/codecov/c/github/Bento-Project-SCARS/ProjectSCARS?token=BJWS49M1DI&flag=web-client&label=&style=flat)](https://app.codecov.io/gh/Bento-Project-SCARS/ProjectSCARS/flags)         |

<details>
    <summary>Code Coverage Graph</summary>
    <a href="https://codecov.io/gh/Bento-Project-SCARS/ProjectSCARS">
        <img src="https://codecov.io/gh/Bento-Project-SCARS/ProjectSCARS/graphs/sunburst.svg?token=BJWS49M1DI" alt="Code Coverage Graph" />
    </a>
    <p>
        The inner-most circle is the entire project, moving away from the center
        are folders then, finally, a single file. The size and color of each
        slice is representing the number of statements and the coverage,
        respectively.
    </p>
</details>

## Documentation

The documentation has been migrated to [the GitHub Wiki](https://github.com/Bento-Project-SCARS/ProjectSCARS/wiki).

## Authors

<div align="center">
    <table>
        <tbody>
            <tr>
                <td><a href="https://github.com/Kirito090504"><img src="https://github.com/Kirito090504.png" alt="Kirito090504 user profile" width="100px" height="auto" /></a></td>
                <td><a href="https://github.com/Staber07"><img src="https://github.com/Staber07.png" alt="Staber07 user profile" width="100px" height="auto" /></a></td>
                <td><a href="https://github.com/rruonan"><img src="https://github.com/rruonan.png" alt="rruonan user profile" width="100px" height="auto" /></a></td>
                <td><a href="https://github.com/Chris1320"><img src="https://github.com/Chris1320.png" alt="Chris1320 user profile" width="100px" height="auto" /></a></td>
            </tr>
            <tr>
                <td><p><b><a href="https://github.com/Kirito090504">Kirito090504</a></b></p></td>
                <td><p><b><a href="https://github.com/Staber07">Staber07</a></b></p></td>
                <td><p><b><a href="https://github.com/rruonan">rruonan</a></b></p></td>
                <td><p><b><a href="https://github.com/Chris1320">Chris1320</a></b></p></td>
            </tr>
            <tr>
                <td><p>BS Computer Science</p></td>
                <td><p>BS Information Technology</p></td>
                <td><p>BS Computer Science</p></td>
                <td><p>BS Computer Science</p></td>
            </tr>
        </tbody>
    </table>
</div>
