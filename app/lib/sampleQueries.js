export const SAMPLE_QUERIES = [
  {
    id: "state-counts-2023",
    label: "Count respondents by state (2023 table)",
    prompt: "Show respondent counts by state for 2023.",
    requiredYears: [2023],
    sql: `SELECT _STATE AS state_fips, COUNT(*) AS respondents
FROM brfss_2023
GROUP BY 1
ORDER BY respondents DESC
LIMIT 25;`,
  },
  {
    id: "smoking-status-tbi-prevalence-2022",
    label: "Correlate smoking status with TBI prevalence (2022 table)",
    prompt: "Correlate smoking status with TBI prevalence for 2022.",
    requiredYears: [2022],
    sql: `SELECT
    CASE _SMOKER3
        WHEN 1 THEN 'Everyday smoker'
        WHEN 2 THEN 'Someday smoker'
        WHEN 3 THEN 'Former smoker'
        WHEN 4 THEN 'Never smoked'
        ELSE 'Other/Unknown Smoking Status'
    END AS smoking_status,
    CAST(SUM(CASE WHEN OH8_1 = 1 THEN 1 ELSE 0 END) AS DOUBLE) * 100.0 / COUNT(*) AS tbi_prevalence_percentage
FROM
    brfss_2022
WHERE
    _SMOKER3 IN (1, 2, 3, 4) AND OH8_1 IN (1, 2)
GROUP BY
    smoking_status
ORDER BY
    smoking_status;`,
  },
  {
    id: "tbi-prevalence-2016-to-2020",
    label: "Compare TBI prevalence from 2016 to 2020",
    prompt: "Compare TBI prevalence from 2016 to 2020.",
    requiredYears: [2016, 2017, 2018, 2019, 2020],
    sql: `SELECT
    2016 AS year,
    COUNT(*) AS total_respondents,
    SUM(CASE
        WHEN (brfss_2016.oh7_1 = 1 OR brfss_2016.oh7_2 = 1 OR brfss_2016.oh7_3 = 1 OR brfss_2016.oh7_4 = 1 OR brfss_2016.oh7_5 = 1 OR brfss_2016.oh7_6 = 1 OR brfss_2016.oh7_10 = 1) THEN 1
        ELSE 0
    END) AS tbi_count,
    (SUM(CASE
        WHEN (brfss_2016.oh7_1 = 1 OR brfss_2016.oh7_2 = 1 OR brfss_2016.oh7_3 = 1 OR brfss_2016.oh7_4 = 1 OR brfss_2016.oh7_5 = 1 OR brfss_2016.oh7_6 = 1 OR brfss_2016.oh7_10 = 1) THEN 1
        ELSE 0
    END) * 100.0 / COUNT(*)) AS tbi_prevalence
FROM
    brfss_2016
UNION ALL
SELECT
    2017 AS year,
    COUNT(*) AS total_respondents,
    SUM(CASE
        WHEN (brfss_2017.oh6_1 = 1 OR brfss_2017.oh6_2 = 1 OR brfss_2017.oh6_3 = 1 OR brfss_2017.oh6_4 = 1 OR brfss_2017.oh6_5 = 1 OR brfss_2017.oh6_6 = 1 OR brfss_2017.oh6_10 = 1) THEN 1
        ELSE 0
    END) AS tbi_count,
    (SUM(CASE
        WHEN (brfss_2017.oh6_1 = 1 OR brfss_2017.oh6_2 = 1 OR brfss_2017.oh6_3 = 1 OR brfss_2017.oh6_4 = 1 OR brfss_2017.oh6_5 = 1 OR brfss_2017.oh6_6 = 1 OR brfss_2017.oh6_10 = 1) THEN 1
        ELSE 0
    END) * 100.0 / COUNT(*)) AS tbi_prevalence
FROM
    brfss_2017
UNION ALL
SELECT
    2018 AS year,
    COUNT(*) AS total_respondents,
    SUM(CASE
        WHEN (brfss_2018.OH7_1 = 1 OR brfss_2018.OH7_2 = 1 OR brfss_2018.OH7_3 = 1 OR brfss_2018.OH7_4 = 1 OR brfss_2018.OH7_5 = 1 OR brfss_2018.OH7_6 = 1 OR brfss_2018.OH7_10 = 1) THEN 1
        ELSE 0
    END) AS tbi_count,
    (SUM(CASE
        WHEN (brfss_2018.OH7_1 = 1 OR brfss_2018.OH7_2 = 1 OR brfss_2018.OH7_3 = 1 OR brfss_2018.OH7_4 = 1 OR brfss_2018.OH7_5 = 1 OR brfss_2018.OH7_6 = 1 OR brfss_2018.OH7_10 = 1) THEN 1
        ELSE 0
    END) * 100.0 / COUNT(*)) AS tbi_prevalence
FROM
    brfss_2018
UNION ALL
SELECT
    2019 AS year,
    COUNT(*) AS total_respondents,
    SUM(CASE
        WHEN (brfss_2019.OH5_1 = 1 OR brfss_2019.OH5_2 = 1 OR brfss_2019.OH5_3 = 1 OR brfss_2019.OH5_4 = 1 OR brfss_2019.OH5_5 = 1 OR brfss_2019.OH5_6 = 1 OR brfss_2019.OH5_10 = 1) THEN 1
        ELSE 0
    END) AS tbi_count,
    (SUM(CASE
        WHEN (brfss_2019.OH5_1 = 1 OR brfss_2019.OH5_2 = 1 OR brfss_2019.OH5_3 = 1 OR brfss_2019.OH5_4 = 1 OR brfss_2019.OH5_5 = 1 OR brfss_2019.OH5_6 = 1 OR brfss_2019.OH5_10 = 1) THEN 1
        ELSE 0
    END) * 100.0 / COUNT(*)) AS tbi_prevalence
FROM
    brfss_2019
UNION ALL
SELECT
    2020 AS year,
    COUNT(*) AS total_respondents,
    SUM(CASE
        WHEN (brfss_2020.OH4_1 = 1 OR brfss_2020.OH4_2 = 1 OR brfss_2020.OH4_3 = 1 OR brfss_2020.OH4_4 = 1 OR brfss_2020.OH4_5 = 1 OR brfss_2020.OH4_6 = 1 OR brfss_2020.OH4_7 = 1 OR brfss_2020.OH4_10 = 1) THEN 1
        ELSE 0
    END) AS tbi_count,
    (SUM(CASE
        WHEN (brfss_2020.OH4_1 = 1 OR brfss_2020.OH4_2 = 1 OR brfss_2020.OH4_3 = 1 OR brfss_2020.OH4_4 = 1 OR brfss_2020.OH4_5 = 1 OR brfss_2020.OH4_6 = 1 OR brfss_2020.OH4_7 = 1 OR brfss_2020.OH4_10 = 1) THEN 1
        ELSE 0
    END) * 100.0 / COUNT(*)) AS tbi_prevalence
FROM
    brfss_2020;`,
  },
];
